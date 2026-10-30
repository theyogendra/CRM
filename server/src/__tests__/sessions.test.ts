import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../lib/db';
import { api, resetDb } from './helpers';

describe('sessions end when the password changes', () => {
  beforeEach(async () => {
    await resetDb();
    await prisma.user.create({
      data: { name: 'Owner', email: 'owner@test.local', role: 'ADMIN', passwordHash: await bcrypt.hash('original-1', 4) },
    });
  });

  it('a token issued before the password change is rejected afterwards', async () => {
    const login = await api().post('/api/auth/login').send({ email: 'owner@test.local', password: 'original-1' });
    const oldToken = `Bearer ${login.body.token}`;
    // make sure the change happens in a later second than the login token's iat
    await new Promise((r) => setTimeout(r, 1100));
    const change = await api().post('/api/auth/change-password').set('Authorization', oldToken)
      .send({ currentPassword: 'original-1', newPassword: 'changed-22' });
    expect(change.status).toBe(200);

    const stale = await api().get('/api/auth/me').set('Authorization', oldToken);
    expect(stale.status).toBe(401);
  });

  it('a new login after the change works', async () => {
    const login = await api().post('/api/auth/login').send({ email: 'owner@test.local', password: 'original-1' });
    await new Promise((r) => setTimeout(r, 1100));
    await api().post('/api/auth/change-password').set('Authorization', `Bearer ${login.body.token}`)
      .send({ currentPassword: 'original-1', newPassword: 'changed-22' });
    const fresh = await api().post('/api/auth/login').send({ email: 'owner@test.local', password: 'changed-22' });
    expect(fresh.status).toBe(200);
    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${fresh.body.token}`);
    expect(me.status).toBe(200);
  });

  it('responses do not reveal the framework and carry protective headers', async () => {
    const res = await api().get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });
});
