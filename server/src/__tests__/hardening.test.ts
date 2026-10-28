import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertJwtSecret } from '../lib/auth';
import { prisma } from '../lib/db';
import { api, makeCustomer, makeUser, resetDb } from './helpers';

describe('route permissions added in the audit', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let staff: Awaited<ReturnType<typeof makeUser>>;
  let template: { id: string };

  beforeEach(async () => {
    await resetDb();
    admin = await makeUser('ADMIN');
    staff = await makeUser('STAFF');
    template = await prisma.messageTemplate.create({ data: { key: 'AUDIT', name: 'Audit template', body: 'Hello {{customer}}' } });
  });

  it('STAFF cannot edit WhatsApp message templates (403)', async () => {
    const res = await api().put(`/api/whatsapp/templates/${template.id}`).set('Authorization', staff.token).send({ body: 'changed' });
    expect(res.status).toBe(403);
    const stored = await prisma.messageTemplate.findUniqueOrThrow({ where: { id: template.id } });
    expect(stored.body).toBe('Hello {{customer}}');
  });

  it('ADMIN can edit WhatsApp message templates', async () => {
    const res = await api().put(`/api/whatsapp/templates/${template.id}`).set('Authorization', admin.token).send({ body: 'changed' });
    expect(res.status).toBe(200);
  });

  it('requests without a token cannot send WhatsApp messages or delete payments (401)', async () => {
    expect((await api().post('/api/whatsapp/send').send({ to: '9000000001', body: 'hi' })).status).toBe(401);
    expect((await api().delete('/api/payments/some-id')).status).toBe(401);
    expect((await api().post('/api/quotations/some-id/convert').send({})).status).toBe(401);
  });

  it('an accepted quotation cannot be deleted (409) and stays on file', async () => {
    const customer = await makeCustomer();
    const created = await api().post('/api/quotations').set('Authorization', staff.token)
      .send({ customerId: customer.id, items: [{ description: 'Item', quantity: 1, rate: 100, gstRate: 5 }] });
    await api().patch(`/api/quotations/${created.body.id}/status`).set('Authorization', staff.token).send({ status: 'ACCEPTED' });

    const res = await api().delete(`/api/quotations/${created.body.id}`).set('Authorization', staff.token);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/accepted and cannot be deleted/);
    expect(await prisma.quotation.findUnique({ where: { id: created.body.id } })).not.toBeNull();
  });

  it('a draft quotation can still be deleted', async () => {
    const customer = await makeCustomer();
    const created = await api().post('/api/quotations').set('Authorization', staff.token)
      .send({ customerId: customer.id, items: [{ description: 'Item', quantity: 1, rate: 100, gstRate: 5 }] });
    const res = await api().delete(`/api/quotations/${created.body.id}`).set('Authorization', staff.token);
    expect(res.status).toBe(204);
    expect(await prisma.quotation.findUnique({ where: { id: created.body.id } })).toBeNull();
  });
});

describe('production JWT secret check', () => {
  const original = { env: process.env.NODE_ENV, secret: process.env.JWT_SECRET };
  afterEach(() => {
    process.env.NODE_ENV = original.env;
    if (original.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original.secret;
  });

  it('refuses to start in production without a real secret', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    expect(() => assertJwtSecret()).toThrow(/JWT_SECRET/);
    process.env.JWT_SECRET = 'change-me-to-a-long-random-string-value';
    expect(() => assertJwtSecret()).toThrow(/JWT_SECRET/);
    process.env.JWT_SECRET = 'short';
    expect(() => assertJwtSecret()).toThrow(/JWT_SECRET/);
  });

  it('accepts a random secret of 32+ characters in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'q8Vf3LxR2mZk9TbN6pWc1YhJ4sD7gA0e';
    expect(() => assertJwtSecret()).not.toThrow();
  });

  it('does not enforce the check outside production', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.JWT_SECRET;
    expect(() => assertJwtSecret()).not.toThrow();
  });
});
