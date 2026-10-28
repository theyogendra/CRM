// GST calculation shared by quotations and invoices.
// Intra-state supply (seller state == buyer state) => CGST + SGST (half each);
// inter-state supply => IGST. Freight is taxed at its own rate (or the
// highest item rate when freightGstRate is 0, matching common practice).

/** GST slabs used in India (percent). Anything else is rejected by validation. */
export const GST_SLABS = [0, 0.25, 3, 5, 12, 18, 28] as const;

export interface ItemInput {
  productId?: string | null;
  sku?: string;
  description: string;
  hsn?: string;
  quantity: number;
  unit?: string;
  rate?: number; // required for free-form lines; catalog lines take it from the catalog
  discount?: number; // percent
  gstRate?: number; // percent
}

export interface TaxLine {
  hsn: string;
  taxable: number;
  rate: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeTotals(
  items: ItemInput[],
  opts: { freight?: number; freightGstRate?: number; isInterState: boolean },
) {
  const lines = items.map((it, i) => {
    const price = it.rate ?? 0; // resolveItems() always sets a price before this runs
    const gross = it.quantity * price;
    const amount = round2(gross - (gross * (it.discount ?? 0)) / 100);
    return {
      position: i,
      productId: it.productId ?? null,
      sku: it.sku ?? '',
      description: it.description,
      hsn: it.hsn ?? '',
      quantity: it.quantity,
      unit: it.unit ?? 'nos',
      rate: price,
      discount: it.discount ?? 0,
      gstRate: it.gstRate ?? 18,
      amount,
    };
  });

  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const freight = round2(opts.freight ?? 0);
  const maxRate = lines.reduce((m, l) => Math.max(m, l.gstRate), 0);
  const freightRate = opts.freightGstRate && opts.freightGstRate > 0 ? opts.freightGstRate : maxRate;

  // HSN-wise summary (freight is grouped with the first item's HSN when rates match)
  const map = new Map<string, TaxLine>();
  const add = (hsn: string, rate: number, taxable: number) => {
    const key = `${hsn}|${rate}`;
    const cur = map.get(key) ?? { hsn, rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    cur.taxable = round2(cur.taxable + taxable);
    map.set(key, cur);
  };
  lines.forEach((l) => add(l.hsn, l.gstRate, l.amount));
  if (freight > 0) add(lines[0]?.hsn ?? '', freightRate, freight);

  const hsnSummary = [...map.values()].map((t) => {
    const tax = round2((t.taxable * t.rate) / 100);
    if (opts.isInterState) return { ...t, igst: tax };
    const half = round2(tax / 2);
    return { ...t, cgst: half, sgst: round2(tax - half) };
  });

  const taxable = round2(subtotal + freight);
  const cgst = round2(hsnSummary.reduce((s, t) => s + t.cgst, 0));
  const sgst = round2(hsnSummary.reduce((s, t) => s + t.sgst, 0));
  const igst = round2(hsnSummary.reduce((s, t) => s + t.igst, 0));
  const exact = round2(taxable + cgst + sgst + igst);
  const total = Math.round(exact);
  const roundOff = round2(total - exact);

  return { lines, subtotal, taxable, cgst, sgst, igst, roundOff, total, hsnSummary };
}

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ones[n];
  return `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ones[h]} Hundred` : '', r ? twoDigits(r) : ''].filter(Boolean).join(' ');
}

/** Indian numbering system: crore, lakh, thousand. */
export function numberToWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${numberToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(' ');
}

export function amountInWords(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  return `INR ${numberToWords(rupees)}${paise ? ` and ${twoDigits(paise)} paise` : ''} Only`;
}

/** Financial year label like 26-27 for dates between Apr-2026 and Mar-2027. */
export function financialYear(d = new Date()): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${String(y).slice(2)}-${String(y + 1).slice(2)}`;
}
