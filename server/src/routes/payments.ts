import { Router } from 'express';
import { z } from 'zod';
import { logActivity, prisma } from '../lib/db';
import { HttpError, toDate } from '../lib/http';
import { publish } from '../lib/queue';
import { syncInvoicePayments } from '../services/documents';
import { inr } from '../services/followups';
import { notifyInvoicePaid, notifyPaymentReceived } from '../services/notifications';
import { requirePermission } from '../lib/auth';

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
  const balance = Math.round((inv.total - inv.amountPaid) * 100) / 100;
  if (body.amount > balance + 0.009) throw new HttpError(400, `Amount exceeds balance of ${inr(balance)}`);

  const payment = await prisma.payment.create({
    data: { ...body, date: toDate(date) ?? new Date(), customerId: inv.customerId },
  });
  await syncInvoicePayments(inv.id);
  await logActivity('payment', `Payment of ${inr(payment.amount)} received against ${inv.number}`, inv.customerId);
  await notifyPaymentReceived(payment, inv);
  const after = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id }, select: { status: true, total: true, number: true } });
  if (after.status === 'PAID') await notifyInvoicePaid({ id: inv.id, number: after.number, total: after.total });

  // the thank-you message goes through the job queue, so a slow or failing WhatsApp API never delays this response
  if (sendThanks) await publish('payment.recorded', { paymentId: payment.id, balanceBefore: balance });
  res.status(201).json(payment);
});

router.delete('/:id', async (req, res) => {
  const p = await prisma.payment.delete({ where: { id: req.params.id } });
  await syncInvoicePayments(p.invoiceId);
  res.status(204).end();
});

export default router;
