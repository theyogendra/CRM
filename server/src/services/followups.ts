import cron from 'node-cron';
import { getCompany, logActivity, prisma } from '../lib/db';
import { renderTemplate, sendWhatsApp } from './whatsapp';
import { notifyInvoiceDueSoon, notifyInvoiceOverdue, notifyQuotationExpired } from './notifications';

const DAY = 86_400_000;
export const inr = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d?: Date | null) =>
  d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const contact = (c: { whatsapp: string; phone: string }) => c.whatsapp || c.phone;

/** Marks unpaid invoices past their due date as OVERDUE and expired quotations as EXPIRED. */
export async function refreshStatuses(now = new Date()) {
  // invoices that just became overdue: change status and raise one notification each
  const overdue = await prisma.invoice.findMany({
    where: { status: { in: ['UNPAID', 'PARTIAL'] }, dueDate: { lt: now } },
  });
  if (overdue.length) {
    await prisma.invoice.updateMany({ where: { id: { in: overdue.map((i) => i.id) } }, data: { status: 'OVERDUE' } });
    for (const inv of overdue) await notifyInvoiceOverdue(inv);
  }

  const expired = await prisma.quotation.findMany({
    where: { status: { in: ['DRAFT', 'SENT'] }, validUntil: { lt: now } },
  });
  if (expired.length) {
    await prisma.quotation.updateMany({ where: { id: { in: expired.map((q) => q.id) } }, data: { status: 'EXPIRED' } });
    for (const q of expired) await notifyQuotationExpired(q);
  }

  // invoices falling due within the reminder window (one notification per due date)
  const company = await getCompany();
  const soonEnd = new Date(now.getTime() + company.reminderDaysBefore * DAY);
  const soon = await prisma.invoice.findMany({
    where: { status: { in: ['UNPAID', 'PARTIAL'] }, dueDate: { gte: now, lte: soonEnd } },
  });
  for (const inv of soon) if (inv.dueDate) await notifyInvoiceDueSoon({ ...inv, dueDate: inv.dueDate });
}

/**
 * The automatic follow-up engine. Finds everything that needs a nudge and sends
 * a WhatsApp message using the editable templates. Safe to run repeatedly:
 * lastReminder / lastFollowUp timestamps prevent duplicates.
 */
export async function runFollowUps(now = new Date()) {
  const company = await getCompany();
  await refreshStatuses(now);
  const summary = { dueSoon: 0, overdue: 0, quotations: 0, proposals: 0 };
  if (!company.autoFollowUp) return summary;

  // 1. Invoices due in the next N days (one reminder)
  const soon = await prisma.invoice.findMany({
    where: {
      status: { in: ['UNPAID', 'PARTIAL'] },
      dueDate: { gte: now, lte: new Date(now.getTime() + company.reminderDaysBefore * DAY) },
      lastReminder: null,
    },
    include: { customer: true },
  });
  for (const inv of soon) {
    const body = await renderTemplate('INVOICE_DUE_SOON', {
      customer: inv.customer.contactPerson || inv.customer.name,
      company: company.name,
      number: inv.number,
      amount: inr(inv.total - inv.amountPaid),
      dueDate: fmtDate(inv.dueDate),
    });
    await sendWhatsApp({ to: contact(inv.customer), body, customerId: inv.customerId, kind: 'INVOICE_DUE_SOON',
      relatedType: 'invoice', relatedId: inv.id, automatic: true });
    await prisma.invoice.update({ where: { id: inv.id }, data: { lastReminder: now } });
    summary.dueSoon++;
  }

  // 2. Overdue invoices, repeated every N days
  const overdue = await prisma.invoice.findMany({
    where: {
      status: 'OVERDUE',
      OR: [{ lastReminder: null }, { lastReminder: { lt: new Date(now.getTime() - company.overdueEveryDays * DAY) } }],
    },
    include: { customer: true },
  });
  for (const inv of overdue) {
    const days = inv.dueDate ? Math.max(1, Math.floor((now.getTime() - inv.dueDate.getTime()) / DAY)) : 0;
    const body = await renderTemplate('INVOICE_OVERDUE', {
      customer: inv.customer.contactPerson || inv.customer.name,
      company: company.name,
      number: inv.number,
      amount: inr(inv.total - inv.amountPaid),
      dueDate: fmtDate(inv.dueDate),
      days,
    });
    await sendWhatsApp({ to: contact(inv.customer), body, customerId: inv.customerId, kind: 'INVOICE_OVERDUE',
      relatedType: 'invoice', relatedId: inv.id, automatic: true });
    await prisma.invoice.update({ where: { id: inv.id }, data: { lastReminder: now } });
    await logActivity('followup', `Overdue reminder sent for ${inv.number}`, inv.customerId);
    summary.overdue++;
  }

  // 3. Quotations sent but not answered
  const qCut = new Date(now.getTime() - company.quotationFollowDays * DAY);
  const quotes = await prisma.quotation.findMany({
    where: {
      status: 'SENT',
      OR: [{ lastFollowUp: null, date: { lt: qCut } }, { lastFollowUp: { lt: qCut } }],
    },
    include: { customer: true },
  });
  for (const q of quotes) {
    const body = await renderTemplate('QUOTATION_FOLLOWUP', {
      customer: q.customer.contactPerson || q.customer.name,
      company: company.name,
      number: q.number,
      amount: inr(q.total),
      validUntil: fmtDate(q.validUntil),
    });
    await sendWhatsApp({ to: contact(q.customer), body, customerId: q.customerId, kind: 'QUOTATION_FOLLOWUP',
      relatedType: 'quotation', relatedId: q.id, automatic: true });
    await prisma.quotation.update({ where: { id: q.id }, data: { lastFollowUp: now } });
    summary.quotations++;
  }

  // 4. Proposals awaiting decision
  const pCut = new Date(now.getTime() - company.proposalFollowDays * DAY);
  const props = await prisma.proposal.findMany({
    where: {
      status: 'SENT',
      OR: [{ lastFollowUp: null, updatedAt: { lt: pCut } }, { lastFollowUp: { lt: pCut } }],
    },
    include: { customer: true },
  });
  for (const p of props) {
    const body = await renderTemplate('PROPOSAL_FOLLOWUP', {
      customer: p.customer.contactPerson || p.customer.name,
      company: company.name,
      number: p.number,
      title: p.title,
      amount: inr(p.value),
    });
    await sendWhatsApp({ to: contact(p.customer), body, customerId: p.customerId, kind: 'PROPOSAL_FOLLOWUP',
      relatedType: 'proposal', relatedId: p.id, automatic: true });
    await prisma.proposal.update({ where: { id: p.id }, data: { lastFollowUp: now } });
    summary.proposals++;
  }

  return summary;
}

export function startFollowUpScheduler() {
  const expr = process.env.FOLLOWUP_CRON || '0 10 * * *';
  if (!cron.validate(expr)) {
    console.warn(`Invalid FOLLOWUP_CRON "${expr}", scheduler disabled`);
    return;
  }
  cron.schedule(expr, () => {
    runFollowUps()
      .then((s) => console.log('[followups]', s))
      .catch((e) => console.error('[followups] failed', e));
  });
  console.log(`[followups] scheduled with "${expr}"`);
}
