import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../lib/auth';
import { getCompany, prisma } from '../lib/db';

const router = Router();

const schema = z
  .object({
    name: z.string().min(1),
    address: z.string(),
    city: z.string(),
    state: z.string(),
    stateCode: z.string(),
    pincode: z.string(),
    gstin: z.string(),
    pan: z.string(),
    email: z.string(),
    phone: z.string(),
    bankAccountName: z.string(),
    bankName: z.string(),
    bankAccountNo: z.string(),
    bankBranchIfsc: z.string(),
    invoicePrefix: z.string().min(1),
    nextInvoiceNo: z.coerce.number().int().positive(),
    quotationPrefix: z.string().min(1),
    nextQuotationNo: z.coerce.number().int().positive(),
    proposalPrefix: z.string().min(1),
    nextProposalNo: z.coerce.number().int().positive(),
    declaration: z.string(),
    remarks: z.string(),
    autoFollowUp: z.boolean(),
    reminderDaysBefore: z.coerce.number().int().min(0),
    overdueEveryDays: z.coerce.number().int().min(1),
    quotationFollowDays: z.coerce.number().int().min(1),
    proposalFollowDays: z.coerce.number().int().min(1),
  })
  .partial();

router.get('/company', async (_req, res) => {
  res.json(await getCompany());
});

router.put('/company', requirePermission('settings:manage'), async (req, res) => {
  await getCompany();
  res.json(await prisma.company.update({ where: { id: 1 }, data: schema.parse(req.body) }));
});

export default router;
