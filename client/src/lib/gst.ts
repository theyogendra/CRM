import type { LineItem } from './types';

// Client-side mirror of server/src/lib/gst.ts for live previews while editing.
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Same GST slabs the server accepts. */
export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28] as const;

export function previewTotals(items: LineItem[], freight: number, freightGstRate: number, isInterState: boolean) {
  const lines = items.map((it) => {
    const gross = (Number(it.quantity) || 0) * (Number(it.rate) || 0);
    return { ...it, amount: r2(gross - (gross * (Number(it.discount) || 0)) / 100) };
  });
  const subtotal = r2(lines.reduce((s, l) => s + l.amount, 0));
  const maxRate = lines.reduce((m, l) => Math.max(m, Number(l.gstRate) || 0), 0);
  const fRate = freightGstRate > 0 ? freightGstRate : maxRate;
  const groups = new Map<string, { rate: number; taxable: number }>();
  const add = (hsn: string, rate: number, taxable: number) => {
    const k = `${hsn}|${rate}`;
    const g = groups.get(k) ?? { rate, taxable: 0 };
    g.taxable = r2(g.taxable + taxable);
    groups.set(k, g);
  };
  lines.forEach((l) => add(l.hsn, Number(l.gstRate) || 0, l.amount));
  if (freight > 0) add(lines[0]?.hsn ?? '', fRate, freight);
  let cgst = 0, sgst = 0, igst = 0;
  groups.forEach((g) => {
    const tax = r2((g.taxable * g.rate) / 100);
    if (isInterState) igst += tax;
    else {
      const half = r2(tax / 2);
      cgst += half;
      sgst += r2(tax - half);
    }
  });
  const taxable = r2(subtotal + (freight || 0));
  const exact = r2(taxable + cgst + sgst + igst);
  const total = Math.round(exact);
  return { lines, subtotal, taxable, cgst: r2(cgst), sgst: r2(sgst), igst: r2(igst), roundOff: r2(total - exact), total };
}
