import { prisma } from '../lib/db';

/**
 * Notifications are created only from real business events. Each event has a dedupeKey, so
 * re-running a sweep (e.g. the overdue check on every page load) never creates duplicates.
 * Notifications are company-wide; the per-user read state lives in NotificationRead.
 */

const money = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export interface NotificationInput {
  type: 'QUOTATION' | 'PROPOSAL' | 'INVOICE' | 'PAYMENT';
  title: string;
  message: string;
  link: string;
  entityId: string;
  dedupeKey: string;
}

export async function notify(n: NotificationInput) {
  await prisma.notification.upsert({
    where: { dedupeKey: n.dedupeKey },
    create: { type: n.type, title: n.title, message: n.message, link: n.link, entityType: n.type.toLowerCase(), entityId: n.entityId, dedupeKey: n.dedupeKey },
    update: {},
  });
}

export const invoiceLink = (id: string) => `/invoices/${id}`;
export const quotationLink = (id: string) => `/quotations/${id}`;
export const proposalLink = () => '/proposals';

export function notifyInvoiceCreated(inv: { id: string; number: string; total: number }) {
  return notify({
    type: 'INVOICE', title: `Invoice ${inv.number} raised`, message: `Total ${money(inv.total)}`,
    link: invoiceLink(inv.id), entityId: inv.id, dedupeKey: `invoice-created:${inv.id}`,
  });
}

export function notifyInvoiceDueSoon(inv: { id: string; number: string; dueDate: Date; total: number; amountPaid: number }) {
  return notify({
    type: 'INVOICE', title: `Invoice ${inv.number} due ${day(inv.dueDate)}`,
    message: `Balance ${money(inv.total - inv.amountPaid)} is due soon`,
    link: invoiceLink(inv.id), entityId: inv.id, dedupeKey: `invoice-due:${inv.id}:${inv.dueDate.toISOString().slice(0, 10)}`,
  });
}

export function notifyInvoiceOverdue(inv: { id: string; number: string; dueDate: Date | null; total: number; amountPaid: number }) {
  return notify({
    type: 'INVOICE', title: `Invoice ${inv.number} is overdue`,
    message: `Balance ${money(inv.total - inv.amountPaid)}${inv.dueDate ? `, was due ${day(inv.dueDate)}` : ''}`,
    link: invoiceLink(inv.id), entityId: inv.id, dedupeKey: `invoice-overdue:${inv.id}`,
  });
}

export function notifyInvoicePaid(inv: { id: string; number: string; total: number }) {
  return notify({
    type: 'INVOICE', title: `Invoice ${inv.number} fully paid`, message: `Settled ${money(inv.total)}`,
    link: invoiceLink(inv.id), entityId: inv.id, dedupeKey: `invoice-paid:${inv.id}`,
  });
}

export function notifyPaymentReceived(p: { id: string; amount: number }, inv: { id: string; number: string }) {
  return notify({
    type: 'PAYMENT', title: `Payment of ${money(p.amount)} received`, message: `Against invoice ${inv.number}`,
    link: invoiceLink(inv.id), entityId: p.id, dedupeKey: `payment:${p.id}`,
  });
}

export function notifyQuotationStatus(q: { id: string; number: string }, status: string) {
  return notify({
    type: 'QUOTATION', title: `Quotation ${q.number} ${status.toLowerCase()}`, message: `Status changed to ${status.toLowerCase()}`,
    link: quotationLink(q.id), entityId: q.id, dedupeKey: `quotation-status:${q.id}:${status}`,
  });
}

export function notifyQuotationExpired(q: { id: string; number: string }) {
  return notify({
    type: 'QUOTATION', title: `Quotation ${q.number} expired`, message: 'Validity date has passed without a decision',
    link: quotationLink(q.id), entityId: q.id, dedupeKey: `quotation-expired:${q.id}`,
  });
}

export function notifyProposalStatus(p: { id: string; number: string; title: string }, status: string) {
  return notify({
    type: 'PROPOSAL', title: `Proposal ${p.number} ${status.toLowerCase()}`, message: p.title,
    link: proposalLink(), entityId: p.id, dedupeKey: `proposal-status:${p.id}:${status}`,
  });
}

/** Public list used by the bell: newest first, with each user's own read flag. */
export async function listNotifications(userId: string, opts: { unreadOnly?: boolean; limit?: number }) {
  const rows = await prisma.notification.findMany({
    where: opts.unreadOnly ? { reads: { none: { userId } } } : {},
    orderBy: { createdAt: 'desc' },
    take: Math.min(opts.limit ?? 50, 200),
    include: { reads: { where: { userId }, select: { readAt: true } } },
  });
  return rows.map(({ reads, ...n }) => ({ ...n, read: reads.length > 0, readAt: reads[0]?.readAt ?? null }));
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { reads: { none: { userId } } } });
}

/** Marks one notification read for this user. Returns false if it does not exist. */
export async function markRead(userId: string, notificationId: string) {
  const exists = await prisma.notification.findUnique({ where: { id: notificationId }, select: { id: true } });
  if (!exists) return false;
  await prisma.notificationRead.upsert({
    where: { userId_notificationId: { userId, notificationId } },
    create: { userId, notificationId },
    update: {},
  });
  return true;
}

export async function markAllRead(userId: string) {
  const unread = await prisma.notification.findMany({
    where: { reads: { none: { userId } } },
    select: { id: true },
  });
  if (unread.length === 0) return 0;
  await prisma.notificationRead.createMany({
    data: unread.map((n) => ({ userId, notificationId: n.id })),
    skipDuplicates: true,
  });
  return unread.length;
}
