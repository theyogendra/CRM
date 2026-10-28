import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { renderWithApp } from '../test/render';
import ChangePasswordDialog, { passwordProblem } from './ChangePasswordDialog';

/** A request the test settles by hand, so in-flight behaviour can be checked deterministically. */
function deferredRequest() {
  let resolve!: (v: unknown) => void;
  const deferred = new Promise((r) => { resolve = r; });
  return { deferred, resolve };
}

vi.mock('../lib/api', async (orig) => {
  const real = await orig<typeof import('../lib/api')>();
  return { ...real, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() } };
});

const post = vi.mocked(api.post);

const field = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
async function fill(current: string, next: string, confirm: string) {
  await userEvent.clear(field('current-password'));
  await userEvent.type(field('current-password'), current);
  await userEvent.clear(field('new-password'));
  await userEvent.type(field('new-password'), next);
  await userEvent.clear(field('confirm-new-password'));
  await userEvent.type(field('confirm-new-password'), confirm);
}
const submitButton = () => screen.getByRole('button', { name: /Change password|Saving/ });

describe('passwordProblem', () => {
  it('accepts a valid change', () => {
    expect(passwordProblem('old-pass-1', 'new-pass-22', 'new-pass-22')).toBe('');
  });
  it('flags every rule', () => {
    expect(passwordProblem('', 'new-pass-22', 'new-pass-22')).toMatch(/current password/);
    expect(passwordProblem('old-pass-1', '', '')).toMatch(/new password/);
    expect(passwordProblem('old-pass-1', 'short', 'short')).toMatch(/at least 8/);
    expect(passwordProblem('same-pass-1', 'same-pass-1', 'same-pass-1')).toMatch(/different/);
    expect(passwordProblem('old-pass-1', 'new-pass-22', '')).toMatch(/Confirm/);
    expect(passwordProblem('old-pass-1', 'new-pass-22', 'new-pass-23')).toMatch(/do not match/);
  });
});

describe('ChangePasswordDialog', () => {
  beforeEach(() => {
    // block body on purpose: an arrow that returns the spy would be treated by Vitest as a cleanup hook
    post.mockReset();
  });

  it('opens over the page: rendered into document.body, not inside the top bar', () => {
    renderWithApp(<ChangePasswordDialog onClose={() => {}} />);
    const overlay = screen.getByRole('dialog', { name: 'Change password' }).closest('.overlay')!;
    expect(overlay.parentElement).toBe(document.body);
  });

  it('shows all three required fields, with the current password first', () => {
    renderWithApp(<ChangePasswordDialog onClose={() => {}} />);
    const labels = Array.from(document.querySelectorAll('input[type="password"]')).map((i) => i.getAttribute('name'));
    expect(labels).toEqual(['current-password', 'new-password', 'confirm-new-password']);
  });

  it('empty fields: validation blocks the request', async () => {
    renderWithApp(<ChangePasswordDialog onClose={() => {}} />);
    await userEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your current password.');
    expect(post).not.toHaveBeenCalled();
  });

  it('mismatched confirmation shows an error and sends nothing', async () => {
    renderWithApp(<ChangePasswordDialog onClose={() => {}} />);
    await fill('old-pass-1', 'new-pass-22', 'new-pass-23');
    await userEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('do not match');
    expect(post).not.toHaveBeenCalled();
  });

  it('a new password shorter than eight characters is refused', async () => {
    renderWithApp(<ChangePasswordDialog onClose={() => {}} />);
    await fill('old-pass-1', 'short', 'short');
    await userEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 8');
    expect(post).not.toHaveBeenCalled();
  });

  it('a new password equal to the current one is refused', async () => {
    renderWithApp(<ChangePasswordDialog onClose={() => {}} />);
    await fill('same-pass-1', 'same-pass-1', 'same-pass-1');
    await userEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('different from the current');
    expect(post).not.toHaveBeenCalled();
  });

  it('a valid change sends the request, reports success and closes', async () => {
    post.mockResolvedValue({ ok: true });
    const onClose = vi.fn();
    renderWithApp(<ChangePasswordDialog onClose={onClose} />);
    await fill('old-pass-1', 'new-pass-22', 'new-pass-22');
    await userEvent.click(submitButton());
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(post).toHaveBeenCalledWith('/auth/change-password', { currentPassword: 'old-pass-1', newPassword: 'new-pass-22' });
    expect(await screen.findByText(/Password changed/)).toBeInTheDocument();
  });

  it('an incorrect current password shows a clear message and keeps the dialog open', async () => {
    post.mockImplementation(async () => { throw new Error('Your current password is incorrect'); });
    const onClose = vi.fn();
    renderWithApp(<ChangePasswordDialog onClose={onClose} />);
    await fill('wrong-guess', 'new-pass-22', 'new-pass-22');
    await userEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Your current password is incorrect.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('a network failure shows a connection message', async () => {
    post.mockImplementation(async () => { throw new TypeError('Failed to fetch'); });
    renderWithApp(<ChangePasswordDialog onClose={() => {}} />);
    await fill('old-pass-1', 'new-pass-22', 'new-pass-22');
    await userEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
  });

  it('a double click or repeated Enter sends only one request', async () => {
    const { deferred, resolve } = deferredRequest();
    post.mockReturnValue(deferred);
    renderWithApp(<ChangePasswordDialog onClose={() => {}} />);
    await fill('old-pass-1', 'new-pass-22', 'new-pass-22');
    fireEvent.click(submitButton());
    fireEvent.click(submitButton());
    fireEvent.submit(field('confirm-new-password').closest('form')!);
    expect(post).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ ok: true }));
  });

  it('Cancel closes without sending anything', async () => {
    const onClose = vi.fn();
    renderWithApp(<ChangePasswordDialog onClose={onClose} />);
    await fill('old-pass-1', 'new-pass-22', 'new-pass-22');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(post).not.toHaveBeenCalled();
  });

  it('Escape closes the dialog when idle', async () => {
    const onClose = vi.fn();
    renderWithApp(<ChangePasswordDialog onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Escape does not close the dialog while a change is being saved', async () => {
    const { deferred, resolve } = deferredRequest();
    post.mockReturnValue(deferred);
    const onClose = vi.fn();
    renderWithApp(<ChangePasswordDialog onClose={onClose} />);
    await fill('old-pass-1', 'new-pass-22', 'new-pass-22');
    fireEvent.click(submitButton());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => resolve({ ok: true }));
  });

  it('password fields are empty when the dialog is opened again', async () => {
    const first = render(<ChangePasswordDialog onClose={() => {}} />);
    await userEvent.type(field('current-password'), 'secret-value');
    first.unmount();
    render(<ChangePasswordDialog onClose={() => {}} />);
    expect(field('current-password')).toHaveValue('');
    expect(field('new-password')).toHaveValue('');
    expect(field('confirm-new-password')).toHaveValue('');
  });
});
