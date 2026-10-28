import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function getCompany() {
  const company = await prisma.company.findUnique({ where: { id: 1 } });
  if (company) return company;
  return prisma.company.create({
    data: { id: 1, name: 'My Company', address: '', state: 'Uttar Pradesh', stateCode: '09', gstin: '' },
  });
}

export async function logActivity(type: string, text: string, customerId?: string | null) {
  await prisma.activity.create({ data: { type, text, customerId: customerId ?? null } });
}
