import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  link: string;
  createdAt: string;
  read: boolean;
}

interface ListResponse { items: AppNotification[]; unreadCount: number }

const POLL_MS = 60_000;

/**
 * Bell in the top bar. Opens a notifications panel (it never navigates by itself). Shows an
 * accurate unread count, lets the user mark items read, and has a clear empty state.
 * Clicking an item marks it read and opens the record it refers to.
 */
export default function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const nav = useNavigate();

  const loadCount = useCallback(async () => {
    try {
      const r = await api.get<{ unreadCount: number }>('/notifications/unread-count');
      setUnread(r.unreadCount);
    } catch { /* keep the last known count; the next poll retries */ }
  }, []);

  const loadList = useCallback(async () => {
    try {
      const r = await api.get<ListResponse>('/notifications?limit=30');
      setItems(r.items);
      setUnread(r.unreadCount);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // keep the badge current even while the panel is closed
  useEffect(() => {
    void loadCount();
    const t = setInterval(loadCount, POLL_MS);
    return () => clearInterval(t);
  }, [loadCount]);

  // load the list whenever the panel opens
  useEffect(() => {
    if (open) void loadList();
  }, [open, loadList]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markRead = async (id: string) => {
    const target = items?.find((n) => n.id === id);
    if (!target || target.read) return;
    setItems((list) => list?.map((n) => (n.id === id ? { ...n, read: true } : n)) ?? null);
    setUnread((u) => Math.max(0, u - 1));
    try {
      const r = await api.post<{ unreadCount: number }>(`/notifications/${id}/read`);
      setUnread(r.unreadCount);
    } catch (e) {
      setError((e as Error).message);
      void loadList();
    }
  };

  const markAll = async () => {
    try {
      const r = await api.post<{ unreadCount: number }>('/notifications/read-all');
      setUnread(r.unreadCount);
      setItems((list) => list?.map((n) => ({ ...n, read: true })) ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const openItem = async (n: AppNotification) => {
    await markRead(n.id);
    setOpen(false);
    if (n.link) nav(n.link);
  };

  return (
    <div className="notif" ref={wrap} style={{ position: 'relative' }}>
      <button
        ref={trigger}
        className="btn btn-ghost icon-btn notif-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={17} />
        {unread > 0 && <span className="notif-badge" data-testid="unread-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div id={panelId} role="dialog" aria-label="Notifications" className="notif-panel card">
          <div className="notif-head">
            <strong>Notifications</strong>
            <span className="small muted" data-testid="panel-unread">{unread} unread</span>
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={markAll} disabled={unread === 0}>
              <CheckCheck size={14} /> Mark all read
            </button>
          </div>

          {error && <div className="error-box" style={{ margin: 12 }}>{error}</div>}

          {items === null && !error && <div className="loading">Loading…</div>}

          {items !== null && items.length === 0 && (
            <div className="empty" data-testid="notif-empty">
              <BellOff size={28} aria-hidden />
              <div style={{ marginTop: 8 }}>No notifications yet</div>
              <div className="small dim">Quotation updates, due dates, overdue invoices and payments will appear here.</div>
            </div>
          )}

          {items !== null && items.length > 0 && (
            <ul className="notif-list" aria-label="Notification list">
              {items.map((n) => (
                <li key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`}>
                  <button className="notif-open" onClick={() => openItem(n)} aria-label={`${n.title}. ${n.read ? 'Read' : 'Unread'}`}>
                    <span className={`notif-dot ${n.read ? 'read' : ''}`} aria-hidden />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="strong small" style={{ display: 'block' }}>{n.title}</span>
                      <span className="small muted" style={{ display: 'block' }}>{n.message}</span>
                      <span className="small dim">{timeAgo(n.createdAt)} · {n.read ? 'Read' : 'Unread'}</span>
                    </span>
                  </button>
                  {!n.read && (
                    <button className="btn btn-sm btn-ghost" onClick={() => markRead(n.id)}>Mark read</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
