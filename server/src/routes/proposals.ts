import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../lib/auth';
import { getCompany, logActivity, prisma } from '../lib/db';
import { HttpError, toDate } from '../lib/http';
import { docBase, itemSchema, nextNumber, priceDocument } from '../services/documents';
import { notifyProposalStatus } from '../services/notifications';
import { inr } from '../services/followups';
import { renderTemplate, sendWhatsApp } from '../services/whatsapp';

const router = Router();

const schema = z.object({
  title: z.string().min(1).max(200),
  customerId: z.string().min(1),
  /** Optional: when line items are given, the value is the server-calculated total. */
  items: z.array(itemSchema).max(200).optional(),
  freight: docBase.freight,
  freightGstRate: docBase.freightGstRate,
  value: z.coerce.number().min(0).max(100_000_000).optional().default(0),
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED']).optional().default('DRAFT'),
  validUntil: z.string().nullable().optional(),
  content: z.string().max(20000).optional().default(''),
});

/** Prices the proposal's lines (if any) and returns the fields to store. */
async function pricing(customerId: string, items: z.infer<typeof itemSchema>[] | undefined, freight: number, freightGstRate: number) {
  if (!items || items.length === 0) return null;
  const priced = await priceDocument(customerId, items, freight, freightGstRate);
  // proposals store the tax breakdown; their "value" is the total including GST
  const { total, ...breakdown } = priced.totals;
  return { lines: priced.lines, totals: { ...breakdown, isInterState: priced.isInterState }, value: total };
}

router.get('/', async (req, res) => {
  const status = String(req.query.status ?? '');
  res.json(
    await prisma.proposal.findMany({
      where: status ? { status: status as 'DRAFT' } : {},
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  );
});

router.get('/:id', async (req, res) => {
  res.json(
    await prisma.proposal.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { customer: true, items: { orderBy: { position: 'asc' } } },
    }),
  );
});

router.post('/', requirePermission('documents:write'), async (req, res) => {
  const { validUntil, items, freight, freightGstRate, ...data } = schema.parse(req.body);
  const price = await pricing(data.customerId, items, freight, freightGstRate);
  const p = await prisma.proposal.create({
    data: {
      ...data,
      ...(price ? { value: price.value, ...price.totals } : {}),
      validUntil: toDate(validUntil),
      number: await nextNumber('proposal'),
      ...(price ? { items: { create: price.lines } } : {}),
    },
  });
  await logActivity('proposal', `Proposal ${p.number} "${p.title}" created`, p.customerId);
  res.status(201).json(p);
});

router.put('/:id', requirePermission('documents:write'), async (req, res) => {
  const body = schema.partial().parse(req.body);
  const current = await prisma.proposal.findUniqueOrThrow({ where: { id: req.params.id } });
  const { validUntil, items, freight, freightGstRate, ...data } = body;

  // Editing the content of an accepted proposal is not allowed; a status-only move (the board) still is.
  const editsContent = items !== undefined || data.title !== undefined || data.value !== undefined || data.content !== undefined;
  if (current.status === 'ACCEPTED' && editsContent) {
    throw new HttpError(409, `Proposal ${current.number} is accepted and can no longer be edited`);
  }

  const price = items !== undefined
    ? await pricing(data.customerId ?? current.customerId, items, freight ?? 0, freightGstRate ?? 0)
    : null;
  // items: [] means "remove all lines": clear old lines and totals, keep the typed value
  const cleared = items !== undefined && !price
    ? { subtotal: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, roundOff: 0 }
    : null;
  const p = await prisma.$transaction(async (tx) => {
    if (items !== undefined) await tx.lineItem.deleteMany({ where: { proposalId: current.id } });
    return tx.proposal.update({
      where: { id: current.id },
      data: {
        ...data,
        ...(price ? { value: price.value, ...price.totals } : {}),
        ...(cleared ?? {}),
        ...(validUntil !== undefined ? { validUntil: toDate(validUntil) } : {}),
        ...(price ? { items: { create: price.lines } } : {}),
      },
    });
  });
  if (data.status && data.status !== current.status) {
    await logActivity('proposal', `Proposal ${p.number} marked ${data.status}`, p.customerId);
    if (data.status === 'ACCEPTED' || data.status === 'REJECTED') await notifyProposalStatus(p, data.status);
  }
  res.json(p);
});

router.post('/:id/send', requirePermission('documents:write'), async (req, res) => {
  const p = await prisma.proposal.findUniqueOrThrow({ where: { id: req.params.id }, include: { customer: true } });
  const company = await getCompany();
  const body =
    (req.body?.message as string) ||
    (await renderTemplate('PROPOSAL_SENT', {
      customer: p.customer.contactPerson || p.customer.name,
      company: company.name,
      number: p.number,
      title: p.title,
      amount: inr(p.value),
    }));
  const msg = await sendWhatsApp({ to: p.customer.whatsapp || p.customer.phone, body, customerId: p.customerId,
    kind: 'PROPOSAL_SENT', relatedType: 'proposal', relatedId: p.id });
  await prisma.proposal.update({ where: { id: p.id }, data: { status: p.status === 'DRAFT' ? 'SENT' : p.status } });
  await logActivity('whatsapp', `Proposal ${p.number} shared on WhatsApp`, p.customerId);
  res.json(msg);
});

router.delete('/:id', requirePermission('documents:write'), async (req, res) => {
  await prisma.proposal.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
