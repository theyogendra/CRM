import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../lib/auth';
import { prisma } from '../lib/db';
import { GST_SLABS } from '../lib/gst';
import { HttpError } from '../lib/http';

/**
 * Catalog of reusable items (products & services). Documents copy an item's details when they
 * are saved, so editing or archiving an item here never changes an existing document.
 */
const router = Router();

const productSchema = z.object({
  sku: z.string().trim().max(64).optional().default(''),
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: z.string().trim().max(1000).optional().default(''),
  hsn: z.string().trim().regex(/^(\d{4}|\d{6}|\d{8})?$/, 'HSN/SAC must be 4, 6 or 8 digits').optional().default(''),
  unit: z.string().trim().min(1).max(20).optional().default('nos'),
  rate: z.coerce.number().min(0).max(100_000_000),
  gstRate: z.coerce.number().refine((v) => (GST_SLABS as readonly number[]).includes(v), 'Not a valid GST slab').optional().default(18),
});

/** SKUs are unique (case-insensitive) when present, including archived items. */
async function assertSkuFree(sku: string, exceptId?: string) {
  if (!sku) return;
  const clash = await prisma.product.findFirst({
    where: { sku: { equals: sku, mode: 'insensitive' }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new HttpError(409, `SKU "${sku}" is already used by another item`);
}

router.get('/', requirePermission('catalog:read'), async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const includeArchived = req.query.includeArchived === '1';
  res.json(
    await prisma.product.findMany({
      where: {
        ...(includeArchived ? {} : { archivedAt: null }),
        ...(q
          ? { OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { sku: { contains: q, mode: 'insensitive' } },
              { hsn: { contains: q } },
            ] }
          : {}),
      },
      orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
    }),
  );
});

router.post('/', requirePermission('catalog:write'), async (req, res) => {
  const data = productSchema.parse(req.body);
  await assertSkuFree(data.sku);
  res.status(201).json(await prisma.product.create({ data }));
});

router.put('/:id', requirePermission('catalog:write'), async (req, res) => {
  const data = productSchema.partial().parse(req.body);
  if (data.sku !== undefined) await assertSkuFree(data.sku, req.params.id);
  res.json(await prisma.product.update({ where: { id: req.params.id }, data }));
});

/** Archive instead of delete: archived items stay visible on the documents that used them. */
router.patch('/:id/archive', requirePermission('catalog:write'), async (req, res) => {
  res.json(await prisma.product.update({ where: { id: req.params.id }, data: { archivedAt: new Date() } }));
});

router.patch('/:id/restore', requirePermission('catalog:write'), async (req, res) => {
  res.json(await prisma.product.update({ where: { id: req.params.id }, data: { archivedAt: null } }));
});

export default router;
