import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { renderWithApp, ADMIN } from '../test/render';
import NotificationsMenu from './NotificationsMenu';

vi.mock('../lib/api', async (orig) => {
  const real = await orig<typeof import('../lib/api')>();
  return {
    ...real,
    api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
  };
});

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

const note = (over: Partial<{ id: string; title: string; read: boolean; link: string }> = {}) => ({
  id: over.id ?? 'n1',
  title: over.title ?? 'Quotation QT/26-27/101 accepted',
  message: 'Status changed to accepted',
  link: over.link ?? '/quotations/q1',
  createdAt: new Date().toISOString(),
  read: over.read ?? false,
});

function serverState(items: ReturnType<typeof note>[]) {
  get.mockImplementation(async (url: string) => {
    if (url.startsWith('/notifications/unread-count')) return { unreadCount: items.filter((i) => !i.read).length };
    return { items, unreadCount: items.filter((i) => !i.read).length };
  });
}

describe('NotificationsMenu', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it('shows the accurate unread count on the bell', async () => {
    serverState([note({ id: 'a' }), note({ id: 'b' }), note({ id: 'c', read: true })]);
    renderWithApp(<NotificationsMenu />);
    expect(await screen.findByTestId('unread-badge')).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: 'Notifications, 2 unread' })).toBeInTheDocument();
  });

  it('shows no badge when everything is read', async () => {
    serverState([note({ read: true })]);
    renderWithApp(<NotificationsMenu />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument();
  });

  it('clicking the bell opens the panel and does NOT navigate away', async () => {
    serverState([note()]);
    renderWithApp(<NotificationsMenu />, { route: '/invoices' });
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    expect(await screen.findByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/invoices');
  });

  it('lists each notification with title, message, time and read status', async () => {
    serverState([note({ title: 'Invoice CF/26-27/9 is overdue' })]);
    renderWithApp(<NotificationsMenu />);
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    const list = await screen.findByRole('list', { name: 'Notification list' });
    expect(within(list).getByText('Invoice CF/26-27/9 is overdue')).toBeInTheDocument();
    expect(within(list).getByText('Status changed to accepted')).toBeInTheDocument();
    expect(within(list).getByText(/Unread/)).toBeInTheDocument();
  });

  it('shows a clear empty state when there are no notifications', async () => {
    serverState([]);
    renderWithApp(<NotificationsMenu />);
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    expect(await screen.findByTestId('notif-empty')).toHaveTextContent('No notifications yet');
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
  });

  it('“Mark read” lowers the count and calls the server once', async () => {
    serverState([note({ id: 'a' }), note({ id: 'b' })]);
    post.mockResolvedValue({ unreadCount: 1 });
    renderWithApp(<NotificationsMenu />);
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    const list = await screen.findByRole('list', { name: 'Notification list' });
    await userEvent.click(within(list).getAllByRole('button', { name: 'Mark read' })[0]);

    expect(post).toHaveBeenCalledWith('/notifications/a/read');
    await waitFor(() => expect(screen.getByTestId('unread-badge')).toHaveTextContent('1'));
  });

  it('“Mark all read” clears the count', async () => {
    serverState([note({ id: 'a' }), note({ id: 'b' })]);
    post.mockResolvedValue({ updated: 2, unreadCount: 0 });
    renderWithApp(<NotificationsMenu />);
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));

    expect(post).toHaveBeenCalledWith('/notifications/read-all');
    await waitFor(() => expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument());
  });

  it('clicking a notification marks it read and opens the record it refers to', async () => {
    serverState([note({ id: 'a', link: '/quotations/q1' })]);
    post.mockResolvedValue({ unreadCount: 0 });
    renderWithApp(<NotificationsMenu />, { route: '/' });
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Quotation QT\/26-27\/101 accepted\. Unread/ }));

    expect(post).toHaveBeenCalledWith('/notifications/a/read');
    expect(screen.getByTestId('location')).toHaveTextContent('/quotations/q1');
  });

  it('Escape closes the panel and returns focus to the bell', async () => {
    serverState([]);
    renderWithApp(<NotificationsMenu />);
    const bell = screen.getByRole('button', { name: /Notifications/ });
    await userEvent.click(bell);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(bell).toHaveFocus();
  });

  it('a failed load shows the error instead of an empty state', async () => {
    get.mockRejectedValue(new Error('Cannot reach the API server'));
    renderWithApp(<NotificationsMenu />, { user: ADMIN });
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    expect(await screen.findByText('Cannot reach the API server')).toBeInTheDocument();
    expect(screen.queryByTestId('notif-empty')).not.toBeInTheDocument();
  });
});
