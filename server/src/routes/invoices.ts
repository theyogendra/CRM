import { Router } from 'express';
import { z } from 'zod';
import { getCompany, logActivity, prisma } from '../lib/db';
import { amountInWords, computeTotals } from '../lib/gst';
import { HttpError, toDate } from '../lib/http';
import { docBase, nextNumber, priceDocument, syncInvoicePayments } from '../services/documents';
import { inr, refreshStatuses } from '../services/followups';
import { notifyInvoiceCreated } from '../services/notifications';
import { renderTemplate, sendWhatsApp } from '../services/whatsapp';
import { requirePermission } from '../lib/auth';

const router = Router();

const schema = z.object({
  ...docBase,
  date: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  status: z.enum(['DRAFT', 'UNPAID', 'CANCELLED']).optional().default('UNPAID'),
  deliveryNote: z.string().optional().default(''),
  buyerOrderNo: z.string().optional().default(''),
  dispatchDocNo: z.string().optional().default(''),
  dispatchedThrough: z.string().optional().default(''),
  destination: z.string().optional().default(''),
  paymentTerms: z.string().optional().default(''),
});

router.get('/', async (req, res) => {
  await refreshStatuses();
  const status = String(req.query.status ?? '');
  const customerId = String(req.query.customerId ?? '');
  res.json(
    await prisma.invoice.findMany({
      where: { ...(status ? { status: status as 'PAID' } : {}), ...(customerId ? { customerId } : {}) },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
    }),
  );
});

router.get('/:id', async (req, res) => {
  const inv = await prisma.invoice.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      customer: true,
      items: { orderBy: { position: 'asc' } },
      payments: { orderBy: { date: 'desc' } },
      quotation: { select: { id: true, number: true } },
    },
  });
  const company = await getCompany();
  const { hsnSummary } = computeTotals(inv.items, {
    freight: inv.freight,
    freightGstRate: inv.freightGstRate,
    isInterState: inv.isInterState,
  });
  res.json({
    ...inv,
    company,
    hsnSummary,
    totalInWords: amountInWords(inv.total),
    taxInWords: amountInWords(Math.round((inv.cgst + inv.sgst + inv.igst) * 100) / 100),
  });
});

const fields = (b: z.infer<typeof schema>) => ({
  customerId: b.customerId,
  dueDate: toDate(b.dueDate),
  freight: b.freight,
  freightGstRate: b.freightGstRate,
  notes: b.notes,
  deliveryNote: b.deliveryNote,
  buyerOrderNo: b.buyerOrderNo,
  dispatchDocNo: b.dispatchDocNo,
  dispatchedThrough: b.dispatchedThrough,
  destination: b.destination,
  paymentTerms: b.paymentTerms,
});

router.post('/', requirePermission('documents:write'), async (req, res) => {
  const body = schema.parse(req.body);
  const priced = await priceDocument(body.customerId, body.items, body.freight, body.freightGstRate);
  const inv = await prisma.invoice.create({
    data: {
      ...fields(body),
      number: await nextNumber('invoice'),
      date: toDate(body.date) ?? new Date(),
      status: body.status,
      isInterState: priced.isInterState,
      ...priced.totals,
      items: { create: priced.lines },
    },
  });
  await prisma.customer.update({ where: { id: inv.customerId }, data: { status: 'ACTIVE' } });
  await logActivity('invoice', `Invoice ${inv.number} raised for ${inr(inv.total)}`, inv.customerId);
  await notifyInvoiceCreated(inv);
  res.status(201).json(inv);
});

/** Only drafts can change. Once issued, an invoice is a tax record and must not be edited silently. */
async function assertDraft(id: string) {
  const current = await prisma.invoice.findUniqueOrThrow({ where: { id }, select: { status: true, number: true } });
  if (current.status !== 'DRAFT') {
    throw new HttpError(409, `Invoice ${current.number} is issued (${current.status.toLowerCase()}) and cannot be edited or deleted. Record payments or issue a new invoice instead.`);
  }
}

router.put('/:id', requirePermission('documents:write'), async (req, res) => {
  const body = schema.parse(req.body);
  await assertDraft(req.params.id);
  const priced = await priceDocument(body.customerId, body.items, body.freight, body.freightGstRate);
  const inv = await prisma.$transaction(async (tx) => {
    await tx.lineItem.deleteMany({ where: { invoiceId: req.params.id } });
    return tx.invoice.update({
      where: { id: req.params.id },
      data: {
        ...fields(body),
        date: toDate(body.date) ?? undefined,
        status: body.status,
        isInterState: priced.isInterState,
        ...priced.totals,
        items: { create: priced.lines },
      },
    });
  });
  await syncInvoicePayments(inv.id);
  res.json(inv);
});

router.post('/:id/send', async (req, res) => {
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: req.params.id }, include: { customer: true } });
  const company = await getCompany();
  const body =
    (req.body?.message as string) ||
    (await renderTemplate('INVOICE_SENT', {
      customer: inv.customer.contactPerson || inv.customer.name,
      company: company.name,
      number: inv.number,
      amount: inr(inv.total),
      dueDate: inv.dueDate ? inv.dueDate.toLocaleDateString('en-IN') : 'on receipt',
      bank: `${company.bankName} A/c ${company.bankAccountNo} IFSC ${company.bankBranchIfsc}`,
    }));
  const msg = await sendWhatsApp({ to: inv.customer.whatsapp || inv.customer.phone, body, customerId: inv.customerId,
    kind: 'INVOICE_SENT', relatedType: 'invoice', relatedId: inv.id });
  if (inv.status === 'DRAFT') await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'UNPAID' } });
  await logActivity('whatsapp', `Invoice ${inv.number} shared on WhatsApp`, inv.customerId);
  res.json(msg);
});

router.delete('/:id', requirePermission('documents:write'), async (req, res) => {
  await assertDraft(req.params.id);
  await prisma.invoice.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
