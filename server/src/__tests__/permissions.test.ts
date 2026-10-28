import { beforeEach, describe, expect, it } from 'vitest';
import { hasPermission, permissionsFor } from '../lib/permissions';
import { api, makeUser, resetDb } from './helpers';

describe('role permissions (unit)', () => {
  it('ADMIN holds every permission', () => {
    for (const p of ['catalog:write', 'settings:manage', 'documents:write', 'payments:write']) {
      expect(hasPermission('ADMIN', p as never)).toBe(true);
    }
  });

  it('STAFF can sell but cannot change the catalog or company settings', () => {
    expect(hasPermission('STAFF', 'documents:write')).toBe(true);
    expect(hasPermission('STAFF', 'catalog:read')).toBe(true);
    expect(hasPermission('STAFF', 'catalog:write')).toBe(false);
    expect(hasPermission('STAFF', 'settings:manage')).toBe(false);
  });

  it('an unknown role gets no permissions at all', () => {
    expect(permissionsFor('SUPERUSER')).toEqual([]);
  });
});

describe('role permissions (API)', () => {
  beforeEach(resetDb);

  it('STAFF gets 403 when creating a catalog item', async () => {
    const staff = await makeUser('STAFF');
    const res = await api().post('/api/products').set('Authorization', staff.token)
      .send({ name: 'Sneaky item', rate: 1, gstRate: 5 });
    expect(res.status).toBe(403);
  });

  it('STAFF gets 403 when changing company settings', async () => {
    const staff = await makeUser('STAFF');
    const res = await api().put('/api/settings/company').set('Authorization', staff.token).send({ name: 'Hacked Ltd' });
    expect(res.status).toBe(403);
  });

  it('ADMIN can create a catalog item', async () => {
    const admin = await makeUser('ADMIN');
    const res = await api().post('/api/products').set('Authorization', admin.token)
      .send({ sku: 'NEW-1', name: 'New item', rate: 250, gstRate: 5, hsn: '6404' });
    expect(res.status).toBe(201);
    expect(res.body.sku).toBe('NEW-1');
  });

  it('rejects requests without a valid token', async () => {
    const res = await api().get('/api/products');
    expect(res.status).toBe(401);
  });

  it('a deleted user’s token stops working', async () => {
    const admin = await makeUser('ADMIN');
    const { prisma } = await import('../lib/db');
    await prisma.user.delete({ where: { id: admin.id } });
    const res = await api().get('/api/auth/me').set('Authorization', admin.token);
    expect(res.status).toBe(401);
  });
});
