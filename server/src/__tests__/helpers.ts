import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../app';
import { signToken } from '../lib/auth';
import { prisma } from '../lib/db';

export const app = createApp();
export const api = () => request(app);

const TABLES = [
  'NotificationRead', 'Notification', 'LineItem', 'Payment', 'Invoice', 'Quotation', 'Proposal', 'Product',
  'Message', 'MessageTemplate', 'Activity', 'Customer', 'Company', 'User',
];

/** Empties every table so each test starts from a known state. */
export async function resetDb() {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`);
}

export async function makeUser(role: 'ADMIN' | 'STAFF', email = `${role.toLowerCase()}@test.local`) {
  const user = await prisma.user.create({
    data: { name: `${role} user`, email, role, passwordHash: await bcrypt.hash('secret123', 4) },
  });
  return { ...user, token: `Bearer ${signToken(user.id)}` };
}

/** Intra-state customer (same state code as the default company, 09). */
export async function makeCustomer(opts: { stateCode?: string; whatsapp?: string } = {}) {
  return prisma.customer.create({
    data: {
      name: 'Test Buyer Pvt Ltd',
      contactPerson: 'Asha',
      phone: '9000000001',
      whatsapp: opts.whatsapp ?? '9000000001',
      state: opts.stateCode === '27' ? 'Maharashtra' : 'Uttar Pradesh',
      stateCode: opts.stateCode ?? '09',
      status: 'ACTIVE',
    },
  });
}

export async function makeProduct(overrides: Partial<{ sku: string; name: string; rate: number; gstRate: number; hsn: string; archivedAt: Date | null }> = {}) {
  return prisma.product.create({
    data: {
      sku: overrides.sku ?? 'SKU-1',
      name: overrides.name ?? 'Leather Oxford',
      hsn: overrides.hsn ?? '6403',
      unit: 'pairs',
      rate: overrides.rate ?? 100,
      gstRate: overrides.gstRate ?? 18,
      archivedAt: overrides.archivedAt ?? null,
    },
  });
}
