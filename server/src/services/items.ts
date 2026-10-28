import { prisma } from '../lib/db';
import { GST_SLABS, type ItemInput } from '../lib/gst';
import { HttpError } from '../lib/http';

/**
 * Turns the line items a client sent into trusted line snapshots.
 *
 * Business rules:
 * - A line linked to a catalog item (productId) takes its name, SKU, HSN, unit, unit price and
 *   GST rate from the catalog ON THE SERVER. The client may only change quantity and discount.
 *   Sending a different price or GST rate for a catalog line is rejected, not silently ignored.
 * - Archived catalog items cannot be added to new documents.
 * - Free-form lines (no productId) are still allowed; their price and GST rate are validated.
 * - Totals are never taken from the client; they are calculated by computeTotals() afterwards.
 */
/** A line whose price, GST and quantity have been validated and are safe to store. */
export type ResolvedItem = {
  productId: string | null;
  sku: string;
  description: string;
  hsn: string;
  unit: string;
  rate: number;
  gstRate: number;
  quantity: number;
  discount: number;
};

export async function resolveItems(items: ItemInput[]): Promise<ResolvedItem[]> {
  const ids = [...new Set(items.map((i) => i.productId).filter((x): x is string => Boolean(x)))];
  const products = ids.length ? await prisma.product.findMany({ where: { id: { in: ids } } }) : [];
  const byId = new Map(products.map((p) => [p.id, p]));

  return items.map((it, index) => {
    const line = `Line ${index + 1}`;
    const quantity = Number(it.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
      throw new HttpError(400, `${line}: quantity must be greater than 0`);
    }
    const discount = Number(it.discount ?? 0);
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      throw new HttpError(400, `${line}: discount must be between 0 and 100`);
    }

    if (it.productId) {
      const product = byId.get(it.productId);
      if (!product) throw new HttpError(400, `${line}: catalog item not found`);
      if (product.archivedAt) throw new HttpError(400, `${line}: "${product.name}" is archived and cannot be added`);
      if (it.rate !== undefined && Math.abs(Number(it.rate) - product.rate) > 0.005) {
        throw new HttpError(400, `${line}: the price of "${product.name}" is set in the catalog (₹${product.rate}) and cannot be changed here`);
      }
      if (it.gstRate !== undefined && Math.abs(Number(it.gstRate) - product.gstRate) > 0.001) {
        throw new HttpError(400, `${line}: the GST rate of "${product.name}" is set in the catalog (${product.gstRate}%)`);
      }
      return {
        productId: product.id,
        sku: product.sku,
        description: product.name,
        hsn: product.hsn,
        unit: product.unit,
        rate: product.rate,
        gstRate: product.gstRate,
        quantity,
        discount,
      };
    }

    if (!it.description || !it.description.trim()) throw new HttpError(400, `${line}: description is required`);
    const rate = Number(it.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100_000_000) throw new HttpError(400, `${line}: rate must be 0 or more`);
    const gstRate = Number(it.gstRate ?? 18);
    if (!(GST_SLABS as readonly number[]).includes(gstRate)) {
      throw new HttpError(400, `${line}: GST rate ${gstRate}% is not a valid GST slab`);
    }
    return {
      productId: null,
      sku: (it.sku ?? '').trim().slice(0, 64),
      description: it.description.trim(),
      hsn: (it.hsn ?? '').trim(),
      unit: it.unit ?? 'nos',
      rate,
      gstRate,
      quantity,
      discount,
    };
  });
}
