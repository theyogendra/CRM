import { Router } from 'express';
import { requirePermission } from '../lib/auth';
import { HttpError } from '../lib/http';
import { listNotifications, markAllRead, markRead, unreadCount } from '../services/notifications';
import { refreshStatuses } from '../services/followups';

/** Notifications for the signed-in user. Each user has their own read state. */
const router = Router();
router.use(requirePermission('notifications:read'));

router.get('/', async (req, res) => {
  // bring overdue/expiring state up to date so the bell reflects what is true right now
  await refreshStatuses();
  const unreadOnly = req.query.filter === 'unread';
  const limit = Number(req.query.limit ?? 50);
  const items = await listNotifications(req.user!.id, { unreadOnly, limit: Number.isFinite(limit) ? limit : 50 });
  res.json({ items, unreadCount: await unreadCount(req.user!.id) });
});

router.get('/unread-count', async (req, res) => {
  res.json({ unreadCount: await unreadCount(req.user!.id) });
});

router.post('/read-all', async (req, res) => {
  const updated = await markAllRead(req.user!.id);
  res.json({ updated, unreadCount: await unreadCount(req.user!.id) });
});

router.post('/:id/read', async (req, res) => {
  const ok = await markRead(req.user!.id, req.params.id);
  if (!ok) throw new HttpError(404, 'Notification not found');
  res.json({ unreadCount: await unreadCount(req.user!.id) });
});

export default router;
