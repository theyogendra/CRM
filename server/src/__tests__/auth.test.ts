import { beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/db';
import { api, makeUser, resetDb } from './helpers';

describe('sign-in and profile', () => {
  beforeEach(resetDb);

  async function withPassword(email: string, role: 'ADMIN' | 'STAFF') {
    return prisma.user.create({
      data: { name: 'Rahul Verma', email, role, passwordHash: await bcrypt.hash('admin123', 4) },
    });
  }

  it('login returns the real name, role and permissions', async () => {
    await withPassword('owner@example.com', 'ADMIN');
    const res = await api().post('/api/auth/login').send({ email: 'owner@example.com', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Rahul Verma', email: 'owner@example.com', role: 'ADMIN' });
    expect(res.body.user.permissions).toContain('catalog:write');
    expect(typeof res.body.token).toBe('string');
  });

  it('a wrong password is rejected', async () => {
    await withPassword('owner@example.com', 'ADMIN');
    const res = await api().post('/api/auth/login').send({ email: 'owner@example.com', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it('stray spaces around the email and password are ignored', async () => {
    await withPassword('owner@example.com', 'ADMIN');
    const res = await api().post('/api/auth/login').send({ email: ' owner@example.com ', password: ' admin123 ' });
    expect(res.status).toBe(200);
  });

  it('a signed-in user can change their password; the old one stops working', async () => {
    const user = await withPassword('owner@example.com', 'ADMIN');
    const token = `Bearer ${(await api().post('/api/auth/login').send({ email: 'owner@example.com', password: 'admin123' })).body.token}`;
    const res = await api().post('/api/auth/change-password').set('Authorization', token)
      .send({ currentPassword: 'admin123', newPassword: 'brand-new-pass' });
    expect(res.status).toBe(200);

    expect((await api().post('/api/auth/login').send({ email: 'owner@example.com', password: 'admin123' })).status).toBe(401);
    expect((await api().post('/api/auth/login').send({ email: 'owner@example.com', password: 'brand-new-pass' })).status).toBe(200);
    expect(user.id).toBeTruthy();
  });

  it('a wrong current password is rejected and nothing changes', async () => {
    await withPassword('owner@example.com', 'ADMIN');
    const token = `Bearer ${(await api().post('/api/auth/login').send({ email: 'owner@example.com', password: 'admin123' })).body.token}`;
    const res = await api().post('/api/auth/change-password').set('Authorization', token)
      .send({ currentPassword: 'wrong-guess', newPassword: 'brand-new-pass' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Your current password is incorrect');
    expect((await api().post('/api/auth/login').send({ email: 'owner@example.com', password: 'admin123' })).status).toBe(200);
  });

  it('the new password must be at least 8 characters and differ from the current one', async () => {
    await withPassword('owner@example.com', 'ADMIN');
    const token = `Bearer ${(await api().post('/api/auth/login').send({ email: 'owner@example.com', password: 'admin123' })).body.token}`;
    const short = await api().post('/api/auth/change-password').set('Authorization', token)
      .send({ currentPassword: 'admin123', newPassword: 'short' });
    expect(short.status).toBe(400);
    const same = await api().post('/api/auth/change-password').set('Authorization', token)
      .send({ currentPassword: 'admin123', newPassword: 'admin123' });
    expect(same.status).toBe(400);
  });

  it('change-password requires a signed-in user', async () => {
    const res = await api().post('/api/auth/change-password').send({ currentPassword: 'a', newPassword: 'longenough' });
    expect(res.status).toBe(401);
  });

  it('/auth/me returns the profile and only the permissions of the role', async () => {
    const staff = await makeUser('STAFF', 'staff@example.com');
    const res = await api().get('/api/auth/me').set('Authorization', staff.token);
    expect(res.body.user.role).toBe('STAFF');
    expect(res.body.user.permissions).toContain('documents:write');
    expect(res.body.user.permissions).not.toContain('settings:manage');
    expect(res.body.user.permissions).not.toContain('catalog:write');
  });
});
