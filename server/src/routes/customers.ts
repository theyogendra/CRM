import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../lib/auth';
import { logActivity, prisma } from '../lib/db';

const router = Router();

const customerSchema = z.object({
  name: z.string().min(1),
  contactPerson: z.string().optional().default(''),
  email: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  whatsapp: z.string().optional().default(''),
  gstin: z.string().optional().default(''),
  address: z.string().optional().default(''),
  city: z.string().optional().default(''),
  state: z.string().optional().default(''),
  stateCode: z.string().optional().default(''),
  pincode: z.string().optional().default(''),
  shipToSame: z.boolean().optional().default(true),
  shipAddress: z.string().optional().default(''),
  status: z.enum(['LEAD', 'ACTIVE', 'INACTIVE']).optional().default('LEAD'),
  source: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

router.get('/', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const status = String(req.query.status ?? '');
  const customers = await prisma.customer.findMany({
    where: {
      ...(status ? { status: status as 'LEAD' } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { contactPerson: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
              { gstin: { contains: q, mode: 'insensitive' } },
              { city: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: { invoices: { select: { total: true, amountPaid: true, status: true } } },
  });
  res.json(
    customers.map(({ invoices, ...c }) => ({
      ...c,
      billed: invoices.filter((i) => i.status !== 'CANCELLED').reduce((s, i) => s + i.total, 0),
      outstanding: invoices
        .filter((i) => !['CANCELLED', 'DRAFT', 'PAID'].includes(i.status))
        .reduce((s, i) => s + i.total - i.amountPaid, 0),
    })),
  );
});

router.get('/:id', async (req, res) => {
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      proposals: { orderBy: { createdAt: 'desc' } },
      quotations: { orderBy: { date: 'desc' } },
      invoices: { orderBy: { date: 'desc' } },
      payments: { orderBy: { date: 'desc' }, include: { invoice: { select: { number: true } } } },
      messages: { orderBy: { createdAt: 'desc' }, take: 50 },
      activities: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
  res.json(customer);
});

router.post('/', requirePermission('customers:write'), async (req, res) => {
  const data = customerSchema.parse(req.body);
  const c = await prisma.customer.create({ data });
  await logActivity('customer', `New customer ${c.name} added`, c.id);
  res.status(201).json(c);
});

router.put('/:id', requirePermission('customers:write'), async (req, res) => {
  const data = customerSchema.partial().parse(req.body);
  res.json(await prisma.customer.update({ where: { id: req.params.id }, data }));
});

router.delete('/:id', requirePermission('customers:write'), async (req, res) => {
  await prisma.customer.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
