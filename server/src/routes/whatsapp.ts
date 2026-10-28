import { Router } from 'express';
import { z } from 'zod';
import { logActivity, prisma } from '../lib/db';
import { HttpError } from '../lib/http';
import { withLock } from '../lib/redis';
import { runFollowUps } from '../services/followups';
import { isCloudConfigured, sendWhatsApp } from '../services/whatsapp';

const router = Router();

router.get('/status', (_req, res) => {
  res.json({
    mode: isCloudConfigured() ? 'cloud' : 'link',
    schedule: process.env.FOLLOWUP_CRON || '0 10 * * *',
  });
});

router.get('/messages', async (req, res) => {
  const customerId = String(req.query.customerId ?? '');
  res.json(
    await prisma.message.findMany({
      where: customerId ? { customerId } : {},
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  );
});

router.post('/send', async (req, res) => {
  const body = z
    .object({ customerId: z.string().optional(), to: z.string().optional(), body: z.string().min(1) })
    .parse(req.body);
  let to = body.to ?? '';
  if (body.customerId && !to) {
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: body.customerId } });
    to = c.whatsapp || c.phone;
  }
  const msg = await sendWhatsApp({ to, body: body.body, customerId: body.customerId });
  if (body.customerId) await logActivity('whatsapp', 'WhatsApp message sent', body.customerId);
  res.status(201).json(msg);
});

router.get('/templates', async (_req, res) => {
  res.json(await prisma.messageTemplate.findMany({ orderBy: { name: 'asc' } }));
});

router.put('/templates/:id', async (req, res) => {
  const { body } = z.object({ body: z.string().min(1) }).parse(req.body);
  res.json(await prisma.messageTemplate.update({ where: { id: req.params.id }, data: { body } }));
});

/** Runs the automatic follow-up engine immediately (it also runs on the cron schedule). */
router.post('/run-followups', async (_req, res) => {
  const summary = await withLock('followups', 10 * 60_000, () => runFollowUps());
  if (!summary) throw new HttpError(409, 'Follow-ups are already running, try again in a minute');
  res.json(summary);
});

export default router;
