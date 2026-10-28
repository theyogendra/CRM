import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../lib/db';
import { api, makeCustomer, makeUser, resetDb } from './helpers';

const DAY = 86_400_000;

describe('notifications', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let staff: Awaited<ReturnType<typeof makeUser>>;
  let customerId: string;

  beforeEach(async () => {
    await resetDb();
    admin = await makeUser('ADMIN');
    staff = await makeUser('STAFF');
    customerId = (await makeCustomer()).id;
  });

  async function newQuotation() {
    const res = await api().post('/api/quotations').set('Authorization', staff.token)
      .send({ customerId, items: [{ description: 'Item', quantity: 1, rate: 100, gstRate: 5 }] });
    return res.body as { id: string; number: string };
  }

  it('shows an empty state with no notifications and an unread count of zero', async () => {
    const res = await api().get('/api/notifications').set('Authorization', admin.token);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.unreadCount).toBe(0);
  });

  it('a quotation accepted by the team creates one unread notification that links to the quotation', async () => {
    const q = await newQuotation();
    await api().patch(`/api/quotations/${q.id}/status`).set('Authorization', staff.token).send({ status: 'ACCEPTED' });

    const res = await api().get('/api/notifications').set('Authorization', admin.token);
    expect(res.body.items).toHaveLength(1);
    const n = res.body.items[0];
    expect(n.title).toBe(`Quotation ${q.number} accepted`);
    expect(n.link).toBe(`/quotations/${q.id}`);
    expect(n.read).toBe(false);
    expect(res.body.unreadCount).toBe(1);
  });

  it('marking one notification read lowers the unread count and is idempotent', async () => {
    const q = await newQuotation();
    await api().patch(`/api/quotations/${q.id}/status`).set('Authorization', staff.token).send({ status: 'REJECTED' });
    const list = await api().get('/api/notifications').set('Authorization', admin.token);
    const id = list.body.items[0].id;

    const first = await api().post(`/api/notifications/${id}/read`).set('Authorization', admin.token);
    expect(first.body.unreadCount).toBe(0);
    const again = await api().post(`/api/notifications/${id}/read`).set('Authorization', admin.token);
    expect(again.status).toBe(200);
    expect(again.body.unreadCount).toBe(0);

    const after = await api().get('/api/notifications?filter=unread').set('Authorization', admin.token);
    expect(after.body.items).toEqual([]);
  });

  it('read state is per user: one person reading does not clear it for another', async () => {
    const q = await newQuotation();
    await api().patch(`/api/quotations/${q.id}/status`).set('Authorization', staff.token).send({ status: 'ACCEPTED' });
    const list = await api().get('/api/notifications').set('Authorization', admin.token);
    await api().post(`/api/notifications/${list.body.items[0].id}/read`).set('Authorization', admin.token);

    const staffView = await api().get('/api/notifications').set('Authorization', staff.token);
    expect(staffView.body.unreadCount).toBe(1);
    expect(staffView.body.items[0].read).toBe(false);
  });

  it('mark-all-read clears every unread notification for that user only', async () => {
    await newQuotation();
    const a = await newQuotation();
    await api().patch(`/api/quotations/${a.id}/status`).set('Authorization', staff.token).send({ status: 'ACCEPTED' });
    const before = await api().get('/api/notifications/unread-count').set('Authorization', admin.token);
    expect(before.body.unreadCount).toBeGreaterThan(0);

    const res = await api().post('/api/notifications/read-all').set('Authorization', admin.token);
    expect(res.body.updated).toBe(before.body.unreadCount);
    expect(res.body.unreadCount).toBe(0);
    const staffCount = await api().get('/api/notifications/unread-count').set('Authorization', staff.token);
    expect(staffCount.body.unreadCount).toBe(before.body.unreadCount);
  });

  it('marking an unknown notification read returns 404', async () => {
    const res = await api().post('/api/notifications/does-not-exist/read').set('Authorization', admin.token);
    expect(res.status).toBe(404);
  });

  it('requires a signed-in user', async () => {
    const res = await api().get('/api/notifications');
    expect(res.status).toBe(401);
  });

  it('a payment creates a payment notification, and a fully paid invoice creates a paid notification', async () => {
    const inv = await api().post('/api/invoices').set('Authorization', staff.token)
      .send({ customerId, status: 'UNPAID', items: [{ description: 'Item', quantity: 1, rate: 100, gstRate: 0 }] });
    await api().post('/api/payments').set('Authorization', staff.token)
      .send({ invoiceId: inv.body.id, amount: inv.body.total, sendThanks: false });

    const list = await api().get('/api/notifications').set('Authorization', admin.token);
    const titles: string[] = list.body.items.map((n: { title: string }) => n.title);
    expect(titles.some((t) => t.startsWith('Payment of'))).toBe(true);
    expect(titles).toContain(`Invoice ${inv.body.number} fully paid`);
  });

  it('an overdue invoice creates exactly one notification, however often the list is loaded', async () => {
    const inv = await api().post('/api/invoices').set('Authorization', staff.token)
      .send({ customerId, status: 'UNPAID', items: [{ description: 'Item', quantity: 1, rate: 100, gstRate: 0 }] });
    await prisma.invoice.update({ where: { id: inv.body.id }, data: { dueDate: new Date(Date.now() - 5 * DAY) } });

    await api().get('/api/notifications').set('Authorization', admin.token);
    await api().get('/api/notifications').set('Authorization', admin.token);
    const list = await api().get('/api/notifications').set('Authorization', admin.token);

    const overdue = list.body.items.filter((n: { title: string }) => n.title === `Invoice ${inv.body.number} is overdue`);
    expect(overdue).toHaveLength(1);
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.body.id } });
    expect(stored.status).toBe('OVERDUE');
  });
});
