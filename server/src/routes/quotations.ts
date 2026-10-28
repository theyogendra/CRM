import { Router } from 'express';
import { z } from 'zod';
import { getCompany, logActivity, prisma } from '../lib/db';
import { amountInWords, computeTotals } from '../lib/gst';
import { HttpError, toDate } from '../lib/http';
import { docBase, nextNumber, priceDocument } from '../services/documents';
import { inr } from '../services/followups';
import { notifyInvoiceCreated, notifyQuotationStatus } from '../services/notifications';
import { renderTemplate, sendWhatsApp } from '../services/whatsapp';
import { requirePermission } from '../lib/auth';

const router = Router();

/** Once a quotation is accepted or converted, its lines are part of a commercial commitment. */
const LOCKED_QUOTATION = ['ACCEPTED', 'CONVERTED'] as const;

const schema = z.object({
  ...docBase,
  date: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED']).optional().default('DRAFT'),
});

router.get('/', async (req, res) => {
  const status = String(req.query.status ?? '');
  res.json(
    await prisma.quotation.findMany({
      where: status ? { status: status as 'DRAFT' } : {},
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
    }),
  );
});

router.get('/:id', async (req, res) => {
  const q = await prisma.quotation.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { customer: true, items: { orderBy: { position: 'asc' } }, invoice: { select: { id: true, number: true } } },
  });
  const company = await getCompany();
  const { hsnSummary } = computeTotals(q.items, { freight: q.freight, freightGstRate: q.freightGstRate, isInterState: q.isInterState });
  res.json({ ...q, company, hsnSummary, totalInWords: amountInWords(q.total),
    taxInWords: amountInWords(q.cgst + q.sgst + q.igst) });
});

router.post('/', requirePermission('documents:write'), async (req, res) => {
  const body = schema.parse(req.body);
  const priced = await priceDocument(body.customerId, body.items, body.freight, body.freightGstRate);
  const q = await prisma.quotation.create({
    data: {
      number: await nextNumber('quotation'),
      customerId: body.customerId,
      date: toDate(body.date) ?? new Date(),
      validUntil: toDate(body.validUntil),
      status: body.status,
      freight: body.freight,
      freightGstRate: body.freightGstRate,
      notes: body.notes,
      isInterState: priced.isInterState,
      ...priced.totals,
      items: { create: priced.lines },
    },
  });
  await logActivity('quotation', `Quotation ${q.number} created for ${inr(q.total)}`, q.customerId);
  res.status(201).json(q);
});

router.put('/:id', requirePermission('documents:write'), async (req, res) => {
  const body = schema.parse(req.body);
  const current = await prisma.quotation.findUniqueOrThrow({ where: { id: req.params.id }, select: { status: true } });
  if (LOCKED_QUOTATION.includes(current.status as 'ACCEPTED')) {
    throw new HttpError(409, `This quotation is ${current.status.toLowerCase()} and can no longer be edited`);
  }
  const priced = await priceDocument(body.customerId, body.items, body.freight, body.freightGstRate);
  const q = await prisma.$transaction(async (tx) => {
    await tx.lineItem.deleteMany({ where: { quotationId: req.params.id } });
    return tx.quotation.update({
      where: { id: req.params.id },
      data: {
        customerId: body.customerId,
        date: toDate(body.date) ?? undefined,
        validUntil: toDate(body.validUntil),
        status: body.status,
        freight: body.freight,
        freightGstRate: body.freightGstRate,
        notes: body.notes,
        isInterState: priced.isInterState,
        ...priced.totals,
        items: { create: priced.lines },
      },
    });
  });
  res.json(q);
});

router.patch('/:id/status', requirePermission('documents:write'), async (req, res) => {
  const { status } = z.object({ status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED']) }).parse(req.body);
  const q = await prisma.quotation.update({ where: { id: req.params.id }, data: { status } });
  await logActivity('quotation', `Quotation ${q.number} marked ${status}`, q.customerId);
  if (status === 'ACCEPTED' || status === 'REJECTED') await notifyQuotationStatus(q, status);
  res.json(q);
});

router.post('/:id/send', requirePermission('documents:write'), async (req, res) => {
  const q = await prisma.quotation.findUniqueOrThrow({ where: { id: req.params.id }, include: { customer: true } });
  const company = await getCompany();
  const body =
    (req.body?.message as string) ||
    (await renderTemplate('QUOTATION_SENT', {
      customer: q.customer.contactPerson || q.customer.name,
      company: company.name,
      number: q.number,
      amount: inr(q.total),
      validUntil: q.validUntil ? q.validUntil.toLocaleDateString('en-IN') : '',
    }));
  const msg = await sendWhatsApp({ to: q.customer.whatsapp || q.customer.phone, body, customerId: q.customerId,
    kind: 'QUOTATION_SENT', relatedType: 'quotation', relatedId: q.id });
  if (q.status === 'DRAFT') await prisma.quotation.update({ where: { id: q.id }, data: { status: 'SENT' } });
  await logActivity('whatsapp', `Quotation ${q.number} shared on WhatsApp`, q.customerId);
  res.json(msg);
});

/** Converts an accepted quotation into a GST tax invoice, copying all line items. */
router.post('/:id/convert', requirePermission('documents:write'), async (req, res) => {
  const q = await prisma.quotation.findUniqueOrThrow({ where: { id: req.params.id }, include: { items: true, invoice: true } });
  if (q.invoice) throw new HttpError(409, `Already converted to ${q.invoice.number}`);
  const dueDays = Number(req.body?.dueDays ?? 15);
  const inv = await prisma.invoice.create({
    data: {
      number: await nextNumber('invoice'),
      customerId: q.customerId,
      quotationId: q.id,
      date: new Date(),
      dueDate: new Date(Date.now() + dueDays * 86_400_000),
      status: 'UNPAID',
      freight: q.freight,
      freightGstRate: q.freightGstRate,
      notes: q.notes,
      isInterState: q.isInterState,
      subtotal: q.subtotal,
      taxable: q.taxable,
      cgst: q.cgst,
      sgst: q.sgst,
      igst: q.igst,
      roundOff: q.roundOff,
      total: q.total,
      items: {
        create: q.items.map(({ id: _id, quotationId: _q, invoiceId: _i, ...it }) => it),
      },
    },
  });
  await prisma.quotation.update({ where: { id: q.id }, data: { status: 'CONVERTED' } });
  await logActivity('invoice', `Quotation ${q.number} converted to invoice ${inv.number}`, q.customerId);
  await notifyInvoiceCreated(inv);
  res.status(201).json(inv);
});

router.delete('/:id', requirePermission('documents:write'), async (req, res) => {
  const current = await prisma.quotation.findUniqueOrThrow({ where: { id: req.params.id }, select: { status: true, number: true } });
  // accepted or converted quotations are commercial records and must stay on file
  if (LOCKED_QUOTATION.includes(current.status as 'ACCEPTED')) {
    throw new HttpError(409, `Quotation ${current.number} is ${current.status.toLowerCase()} and cannot be deleted`);
  }
  await prisma.quotation.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
