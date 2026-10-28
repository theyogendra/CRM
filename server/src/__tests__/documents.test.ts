import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../lib/db';
import { api, makeCustomer, makeProduct, makeUser, resetDb } from './helpers';

describe('reusable items on documents', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let staff: Awaited<ReturnType<typeof makeUser>>;
  let customerId: string;

  beforeEach(async () => {
    await resetDb();
    admin = await makeUser('ADMIN');
    staff = await makeUser('STAFF');
    customerId = (await makeCustomer()).id;
  });

  describe('validation and server-side pricing', () => {
    it('a catalog line takes name, SKU, HSN, price and GST from the catalog, not from the client', async () => {
      const product = await makeProduct({ sku: 'OXF-01', rate: 100, gstRate: 18, hsn: '6403' });
      const res = await api().post('/api/quotations').set('Authorization', staff.token)
        .send({ customerId, items: [{ productId: product.id, quantity: 2, discount: 10 }] });
      expect(res.status).toBe(201);
      const q = await api().get(`/api/quotations/${res.body.id}`).set('Authorization', staff.token);
      const line = q.body.items[0];
      expect(line.description).toBe('Leather Oxford');
      expect(line.sku).toBe('OXF-01');
      expect(line.hsn).toBe('6403');
      expect(line.rate).toBe(100);
      expect(line.gstRate).toBe(18);
      expect(line.amount).toBe(180); // 2 × 100, less 10%
    });

    it('totals are calculated on the server; client-sent totals are ignored', async () => {
      const res = await api().post('/api/quotations').set('Authorization', staff.token)
        .send({ customerId, total: 1, taxable: 1, items: [{ description: 'Socks', quantity: 1, rate: 100, gstRate: 5, hsn: '6115' }] });
      expect(res.status).toBe(201);
      expect(res.body.taxable).toBe(100);
      expect(res.body.total).toBe(105);
      expect(res.body.cgst + res.body.sgst).toBeCloseTo(5, 2); // same state → CGST + SGST
    });

    it('rejects a catalog line whose price was changed by the client', async () => {
      const product = await makeProduct({ rate: 100 });
      const res = await api().post('/api/quotations').set('Authorization', staff.token)
        .send({ customerId, items: [{ productId: product.id, quantity: 1, rate: 1, discount: 0 }] });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/set in the catalog/);
    });

    it('rejects archived catalog items on new documents', async () => {
      const product = await makeProduct({ archivedAt: new Date() });
      const res = await api().post('/api/quotations').set('Authorization', staff.token)
        .send({ customerId, items: [{ productId: product.id, quantity: 1 }] });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/archived/);
    });

    it('rejects a free-form line with a GST rate that is not a valid slab', async () => {
      const res = await api().post('/api/quotations').set('Authorization', staff.token)
        .send({ customerId, items: [{ description: 'Odd', quantity: 1, rate: 10, gstRate: 7 }] });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not a valid GST slab/);
    });

    it('rejects discounts above 100% and non-positive quantities', async () => {
      const big = await api().post('/api/quotations').set('Authorization', staff.token)
        .send({ customerId, items: [{ description: 'X', quantity: 1, rate: 10, discount: 150 }] });
      expect(big.status).toBe(400);
      const zero = await api().post('/api/quotations').set('Authorization', staff.token)
        .send({ customerId, items: [{ description: 'X', quantity: 0, rate: 10 }] });
      expect(zero.status).toBe(400);
    });

    it('rejects a free-form line without a description', async () => {
      const res = await api().post('/api/quotations').set('Authorization', staff.token)
        .send({ customerId, items: [{ description: '   ', quantity: 1, rate: 10 }] });
      expect(res.status).toBe(400);
    });
  });

  describe('historical integrity', () => {
    it('changing or archiving a catalog item does not change a saved quotation', async () => {
      const product = await makeProduct({ rate: 100, gstRate: 18 });
      const created = await api().post('/api/quotations').set('Authorization', staff.token)
        .send({ customerId, items: [{ productId: product.id, quantity: 3 }] });
      const before = await api().get(`/api/quotations/${created.body.id}`).set('Authorization', staff.token);

      await api().put(`/api/products/${product.id}`).set('Authorization', admin.token).send({ rate: 999, gstRate: 5 });
      await api().patch(`/api/products/${product.id}/archive`).set('Authorization', admin.token).send({});

      const after = await api().get(`/api/quotations/${created.body.id}`).set('Authorization', staff.token);
      expect(after.body.items[0].rate).toBe(100);
      expect(after.body.items[0].gstRate).toBe(18);
      expect(after.body.total).toBe(before.body.total);
      expect(after.body.items[0].sku).toBe(product.sku);
    });

    it('converting a quotation copies its snapshot, which later catalog changes cannot alter', async () => {
      const product = await makeProduct({ rate: 100 });
      const q = await api().post('/api/quotations').set('Authorization', staff.token)
        .send({ customerId, items: [{ productId: product.id, quantity: 2 }] });
      await api().patch(`/api/quotations/${q.body.id}/status`).set('Authorization', staff.token).send({ status: 'ACCEPTED' });
      const inv = await api().post(`/api/quotations/${q.body.id}/convert`).set('Authorization', staff.token).send({});
      expect(inv.status).toBe(201);

      await api().put(`/api/products/${product.id}`).set('Authorization', admin.token).send({ rate: 500 });
      const invoice = await api().get(`/api/invoices/${inv.body.id}`).set('Authorization', staff.token);
      expect(invoice.body.items[0].rate).toBe(100);
      expect(invoice.body.total).toBe(q.body.total);
    });

    it('an issued invoice cannot be edited or deleted', async () => {
      const inv = await api().post('/api/invoices').set('Authorization', staff.token)
        .send({ customerId, status: 'UNPAID', items: [{ description: 'Item', quantity: 1, rate: 100, gstRate: 18 }] });
      expect(inv.status).toBe(201);

      const edit = await api().put(`/api/invoices/${inv.body.id}`).set('Authorization', staff.token)
        .send({ customerId, items: [{ description: 'Changed', quantity: 1, rate: 1, gstRate: 18 }] });
      expect(edit.status).toBe(409);
      expect(edit.body.error).toMatch(/issued/);

      const del = await api().delete(`/api/invoices/${inv.body.id}`).set('Authorization', admin.token);
      expect(del.status).toBe(409);

      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.body.id }, include: { items: true } });
      expect(stored.items[0].description).toBe('Item');
    });

    it('a draft invoice can still be edited', async () => {
      const inv = await api().post('/api/invoices').set('Authorization', staff.token)
        .send({ customerId, status: 'DRAFT', items: [{ description: 'Item', quantity: 1, rate: 100, gstRate: 18 }] });
      const edit = await api().put(`/api/invoices/${inv.body.id}`).set('Authorization', staff.token)
        .send({ customerId, status: 'DRAFT', items: [{ description: 'Item', quantity: 4, rate: 100, gstRate: 18 }] });
      expect(edit.status).toBe(200);
      expect(edit.body.taxable).toBe(400);
    });

    it('an accepted quotation cannot be edited', async () => {
      const q = await api().post('/api/quotations').set('Authorization', staff.token)
        .send({ customerId, items: [{ description: 'Item', quantity: 1, rate: 100 }] });
      await api().patch(`/api/quotations/${q.body.id}/status`).set('Authorization', staff.token).send({ status: 'ACCEPTED' });
      const edit = await api().put(`/api/quotations/${q.body.id}`).set('Authorization', staff.token)
        .send({ customerId, items: [{ description: 'Item', quantity: 9, rate: 100 }] });
      expect(edit.status).toBe(409);
    });
  });

  describe('proposals with line items', () => {
    it('the value of a proposal with line items is the server-calculated total', async () => {
      const product = await makeProduct({ rate: 200, gstRate: 5 });
      const res = await api().post('/api/proposals').set('Authorization', staff.token)
        .send({ title: 'Bulk order', customerId, value: 1, items: [{ productId: product.id, quantity: 10 }] });
      expect(res.status).toBe(201);
      expect(res.body.value).toBe(2100); // 2000 + 5% GST
      expect(res.body.taxable).toBe(2000);
    });

    it('removing all line items clears the old lines and keeps the typed value', async () => {
      const product = await makeProduct({ rate: 200 });
      const created = await api().post('/api/proposals').set('Authorization', staff.token)
        .send({ title: 'Plan', customerId, items: [{ productId: product.id, quantity: 1 }] });
      const cleared = await api().put(`/api/proposals/${created.body.id}`).set('Authorization', staff.token)
        .send({ items: [], value: 5000 });
      expect(cleared.status).toBe(200);
      const detail = await api().get(`/api/proposals/${created.body.id}`).set('Authorization', staff.token);
      expect(detail.body.items).toHaveLength(0);
      expect(detail.body.value).toBe(5000);
      expect(detail.body.taxable).toBe(0);
    });
  });
});
