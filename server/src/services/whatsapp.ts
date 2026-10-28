import { prisma } from '../lib/db';

/** Normalises an Indian/international number into digits with country code (default +91). */
export function normalizePhone(raw: string): string {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d;
}

export const waLink = (phone: string, body: string) =>
  `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(body)}`;

export const isCloudConfigured = () =>
  Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

/** Replaces {{placeholders}} in a template body. */
export function render(body: string, vars: Record<string, string | number | undefined>) {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => String(vars[k] ?? ''));
}

export async function renderTemplate(key: string, vars: Record<string, string | number | undefined>) {
  const t = await prisma.messageTemplate.findUnique({ where: { key } });
  return t ? render(t.body, vars) : '';
}

interface SendInput {
  to: string;
  body: string;
  customerId?: string | null;
  kind?: string;
  relatedType?: string;
  relatedId?: string;
  automatic?: boolean;
  /**
   * Set by queue jobs that will be retried: a temporary Cloud API failure (network, 429, 5xx)
   * throws instead of being logged as FAILED, so the queue can try again later.
   */
  throwIfTemporary?: boolean;
}

export class TemporarySendError extends Error {}

/**
 * Sends a WhatsApp text. With Cloud API credentials the message is delivered
 * directly; otherwise it is logged with a wa.me click-to-chat link so the user
 * can send it in one tap. Either way it is stored in the Message log.
 */
export async function sendWhatsApp(input: SendInput) {
  const to = normalizePhone(input.to);
  const base = {
    customerId: input.customerId ?? null,
    to,
    body: input.body,
    kind: input.kind ?? 'MANUAL',
    relatedType: input.relatedType ?? '',
    relatedId: input.relatedId ?? '',
    automatic: input.automatic ?? false,
    link: waLink(to, input.body),
  };

  if (!to) return prisma.message.create({ data: { ...base, status: 'FAILED', error: 'No WhatsApp number' } });

  if (!isCloudConfigured()) return prisma.message.create({ data: { ...base, status: 'LINK' } });

  let res: Response;
  try {
    const version = process.env.WHATSAPP_API_VERSION || 'v21.0';
    res = await fetch(
      `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: input.body } }),
      },
    );
  } catch (e) {
    if (input.throwIfTemporary) throw new TemporarySendError(String(e));
    return prisma.message.create({ data: { ...base, status: 'FAILED', error: String(e).slice(0, 500) } });
  }
  if (!res.ok) {
    const text = await res.text();
    if (input.throwIfTemporary && (res.status === 429 || res.status >= 500)) {
      throw new TemporarySendError(`WhatsApp API ${res.status}: ${text.slice(0, 200)}`);
    }
    return prisma.message.create({ data: { ...base, status: 'FAILED', error: text.slice(0, 500) } });
  }
  return prisma.message.create({ data: { ...base, status: 'SENT' } });
}
