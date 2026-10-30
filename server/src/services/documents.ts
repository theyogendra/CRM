import { z } from 'zod';
import { getCompany, prisma } from '../lib/db';
import { computeTotals, financialYear } from '../lib/gst';
import { HttpError } from '../lib/http';
import { resolveItems } from './items';

/** Accepts a line from the editor. Catalog lines only need productId + quantity (+ discount). */
export const itemSchema = z.object({
  productId: z.string().min(1).nullish(),
  sku: z.string().max(64).optional(),
  description: z.string().max(500).optional().default(''),
  hsn: z.string().max(16).optional().default(''),
  quantity: z.coerce.number(),
  unit: z.string().max(20).optional(),
  rate: z.coerce.number().optional(),
  discount: z.coerce.number().optional().default(0),
  gstRate: z.coerce.number().optional(),
});

export const docBase = {
  customerId: z.string().min(1),
  items: z.array(itemSchema).min(1, 'Add at least one item').max(200),
  freight: z.coerce.number().min(0).max(100_000_000).optional().default(0),
  freightGstRate: z.coerce.number().min(0).max(28).optional().default(0),
  notes: z.string().max(2000).optional().default(''),
};

/** State code from the customer record, falling back to the first two digits of the GSTIN. */
const stateCodeOf = (c: { stateCode: string; gstin: string }) =>
  c.stateCode || (/^\d{2}/.test(c.gstin) ? c.gstin.slice(0, 2) : '');

/**
 * Validates lines against the catalog and business rules, then calculates every amount on the
 * server. Client-side totals are never used.
 */
export async function priceDocument(customerId: string, items: z.infer<typeof itemSchema>[], freight: number, freightGstRate: number) {
  const [company, customer] = await Promise.all([
    getCompany(),
    prisma.customer.findUnique({ where: { id: customerId } }),
  ]);
  if (!customer) throw new HttpError(400, 'Customer not found');
  const buyer = stateCodeOf(customer);
  if (!buyer) throw new HttpError(400, "Set the customer's state (place of supply) before issuing a GST document");
  const isInterState = Boolean(company.stateCode && buyer !== company.stateCode);
  const resolved = await resolveItems(items);
  const t = computeTotals(resolved, { freight, freightGstRate, isInterState });
  return {
    isInterState,
    lines: t.lines,
    totals: {
      subtotal: t.subtotal,
      taxable: t.taxable,
      cgst: t.cgst,
      sgst: t.sgst,
      igst: t.igst,
      roundOff: t.roundOff,
      total: t.total,
    },
  };
}

/** Atomically reserves the next document number, e.g. CF/26-27/387. */
export async function nextNumber(kind: 'invoice' | 'quotation' | 'proposal') {
  await getCompany();
  const field = kind === 'invoice' ? 'nextInvoiceNo' : kind === 'quotation' ? 'nextQuotationNo' : 'nextProposalNo';
  const c = await prisma.company.update({ where: { id: 1 }, data: { [field]: { increment: 1 } } });
  const prefix = kind === 'invoice' ? c.invoicePrefix : kind === 'quotation' ? c.quotationPrefix : c.proposalPrefix;
  const seq = (c[field] as number) - 1;
  return `${prefix}/${financialYear()}/${seq}`;
}

/** Recomputes paid amount and status after payments change. */
export async function syncInvoicePayments(invoiceId: string) {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
  if (!inv) return;
  const paid = Math.round(inv.payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  let status = inv.status;
  if (status !== 'CANCELLED' && status !== 'DRAFT') {
    if (paid >= inv.total - 0.009) status = 'PAID';
    else if (inv.dueDate && inv.dueDate < new Date()) status = 'OVERDUE';
    else status = paid > 0 ? 'PARTIAL' : 'UNPAID';
  }
  await prisma.invoice.update({ where: { id: invoiceId }, data: { amountPaid: paid, status } });
}
