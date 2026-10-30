import { Router } from 'express';
import { z } from 'zod';
import { logActivity, prisma } from '../lib/db';
import { HttpError, toDate } from '../lib/http';
import { publish } from '../lib/queue';
import { syncInvoicePayments } from '../services/documents';
import { inr } from '../services/followups';
import { notifyInvoicePaid, notifyPaymentReceived } from '../services/notifications';
import { requirePermission } from '../lib/auth';

/** A serializable transaction that loses a write race fails with P2034; retrying lets it see the other payment. */
async function retryOnConflict<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (e) {
      if ((e as { code?: string }).code === 'P2034' && attempt < attempts) continue;
      throw e;
    }
  }
}

const router = Router();

const schema = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().positive(),
  date: z.string().nullable().optional(),
  mode: z.enum(['UPI', 'BANK_TRANSFER', 'CASH', 'CHEQUE', 'CARD', 'OTHER']).optional().default('UPI'),
  reference: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  sendThanks: z.boolean().optional().default(true),
});

router.get('/', async (_req, res) => {
  res.json(
    await prisma.payment.findMany({
      include: { customer: { select: { id: true, name: true } }, invoice: { select: { id: true, number: true, total: true } } },
      orderBy: { date: 'desc' },
    }),
  );
});

router.post('/', requirePermission('payments:write'), async (req, res) => {
  const { sendThanks, date, ...body } = schema.parse(req.body);
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: body.invoiceId }, include: { customer: true } });
  if (inv.status === 'DRAFT' || inv.status === 'CANCELLED') {
    throw new HttpError(409, `Invoice ${inv.number} is ${inv.status.toLowerCase()} and cannot take payments`);
  }
  // the balance check and the insert run in one serializable transaction, so two payments at once cannot overpay
  const { payment, balance } = await retryOnConflict(() => prisma.$transaction(async (tx) => {
    const paid = await tx.payment.aggregate({ where: { invoiceId: inv.id }, _sum: { amount: true } });
    const due = Math.round((inv.total - (paid._sum.amount ?? 0)) * 100) / 100;
    if (body.amount > due + 0.009) throw new HttpError(400, `Amount exceeds balance of ${inr(due)}`);
    const created = await tx.payment.create({
      data: { ...body, date: toDate(date) ?? new Date(), customerId: inv.customerId },
    });
    return { payment: created, balance: due };
  }, { isolationLevel: 'Serializable' }));
  await syncInvoicePayments(inv.id);
  await logActivity('payment', `Payment of ${inr(payment.amount)} received against ${inv.number}`, inv.customerId);
  await notifyPaymentReceived(payment, inv);
  const after = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id }, select: { status: true, total: true, number: true } });
  if (after.status === 'PAID') await notifyInvoicePaid({ id: inv.id, number: after.number, total: after.total });

  // the thank-you message goes through the job queue, so a slow or failing WhatsApp API never delays this response
  if (sendThanks) await publish('payment.recorded', { paymentId: payment.id, balanceBefore: balance });
  res.status(201).json(payment);
});

router.delete('/:id', requirePermission('payments:write'), async (req, res) => {
  const p = await prisma.payment.delete({ where: { id: req.params.id } });
  await syncInvoicePayments(p.invoiceId);
  res.status(204).end();
});

export default router;
