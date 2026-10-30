import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../lib/db';
import { api, makeCustomer, makeUser, resetDb } from './helpers';

describe('business rules found in the logic review', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let staff: Awaited<ReturnType<typeof makeUser>>;
  let customerId: string;

  beforeEach(async () => {
    await resetDb();
    admin = await makeUser('ADMIN');
    staff = await makeUser('STAFF');
    customerId = (await makeCustomer()).id;
  });

  async function issuedInvoice(total = 100) {
    const res = await api().post('/api/invoices').set('Authorization', staff.token)
      .send({ customerId, status: 'UNPAID', items: [{ description: 'Item', quantity: 1, rate: total, gstRate: 0 }] });
    return res.body as { id: string; total: number; number: string };
  }

  it('a customer with invoices cannot be deleted (409) and the invoice remains', async () => {
    const inv = await issuedInvoice();
    const res = await api().delete(`/api/customers/${customerId}`).set('Authorization', admin.token);
    expect(res.status).toBe(409);
    expect(await prisma.invoice.findUnique({ where: { id: inv.id } })).not.toBeNull();
  });

  it('a customer with no tax records can still be deleted', async () => {
    const empty = await makeCustomer();
    const res = await api().delete(`/api/customers/${empty.id}`).set('Authorization', admin.token);
    expect(res.status).toBe(204);
  });

  it('a payment larger than the balance is rejected (400)', async () => {
    const inv = await issuedInvoice(100);
    const res = await api().post('/api/payments').set('Authorization', staff.token)
      .send({ invoiceId: inv.id, amount: inv.total + 1, sendThanks: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds balance/);
  });

  it('two payments that together exceed the balance: only the first is recorded', async () => {
    const inv = await issuedInvoice(100);
    const [a, b] = await Promise.all([
      api().post('/api/payments').set('Authorization', staff.token).send({ invoiceId: inv.id, amount: 100, sendThanks: false }),
      api().post('/api/payments').set('Authorization', staff.token).send({ invoiceId: inv.id, amount: 100, sendThanks: false }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 400]);
    const stored = await prisma.payment.aggregate({ where: { invoiceId: inv.id }, _sum: { amount: true } });
    expect(stored._sum.amount).toBe(100);
  });

  it('a payment on a draft invoice is rejected (409)', async () => {
    const res = await api().post('/api/invoices').set('Authorization', staff.token)
      .send({ customerId, status: 'DRAFT', items: [{ description: 'Item', quantity: 1, rate: 100, gstRate: 0 }] });
    const pay = await api().post('/api/payments').set('Authorization', staff.token)
      .send({ invoiceId: res.body.id, amount: 10, sendThanks: false });
    expect(pay.status).toBe(409);
  });

  it('an accepted quotation cannot change status again (409)', async () => {
    const q = await api().post('/api/quotations').set('Authorization', staff.token)
      .send({ customerId, items: [{ description: 'Item', quantity: 1, rate: 100, gstRate: 0 }] });
    await api().patch(`/api/quotations/${q.body.id}/status`).set('Authorization', staff.token).send({ status: 'ACCEPTED' });
    const back = await api().patch(`/api/quotations/${q.body.id}/status`).set('Authorization', staff.token).send({ status: 'DRAFT' });
    expect(back.status).toBe(409);
  });

  it('a rejected quotation cannot be converted to an invoice (409)', async () => {
    const q = await api().post('/api/quotations').set('Authorization', staff.token)
      .send({ customerId, items: [{ description: 'Item', quantity: 1, rate: 100, gstRate: 0 }] });
    await api().patch(`/api/quotations/${q.body.id}/status`).set('Authorization', staff.token).send({ status: 'REJECTED' });
    const conv = await api().post(`/api/quotations/${q.body.id}/convert`).set('Authorization', staff.token).send({});
    expect(conv.status).toBe(409);
  });

  it('a GST document for a customer without a state is refused (400)', async () => {
    const noState = await prisma.customer.create({ data: { name: 'No State Ltd', phone: '9000000002', whatsapp: '9000000002' } });
    const res = await api().post('/api/invoices').set('Authorization', staff.token)
      .send({ customerId: noState.id, items: [{ description: 'Item', quantity: 1, rate: 100, gstRate: 0 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/place of supply/);
  });
});
