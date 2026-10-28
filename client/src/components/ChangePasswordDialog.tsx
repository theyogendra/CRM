import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { Field, Modal, useToast } from './ui';

export const MIN_PASSWORD_LENGTH = 8;

/** Local checks, run before any request. The server repeats every rule and verifies the current password. */
export function passwordProblem(current: string, next: string, confirm: string): string {
  if (!current.trim()) return 'Enter your current password.';
  if (!next.trim()) return 'Enter a new password.';
  if (next.trim().length < MIN_PASSWORD_LENGTH) return `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (next.trim() === current.trim()) return 'The new password must be different from the current password.';
  if (!confirm.trim()) return 'Confirm the new password.';
  if (next !== confirm) return 'The new password and confirmation do not match.';
  return '';
}

/** Turns a failed request into a message the user can act on. */
function describeFailure(e: unknown): string {
  if (e instanceof TypeError) return 'Could not reach the server. Check your connection and try again.';
  const message = (e as Error).message || '';
  if (/incorrect/i.test(message)) return 'Your current password is incorrect.';
  if (/different/i.test(message)) return 'The new password must be different from the current password.';
  if (/at least 8/i.test(message)) return `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  return message || 'The password could not be changed. Please try again.';
}

export default function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // a ref, not state, so a second Enter or double-click is rejected before React re-renders
  const inFlight = useRef(false);
  const toast = useToast();

  const clearFields = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
  };

  const close = () => {
    if (inFlight.current) return;
    clearFields();
    onClose();
  };

  const submit = async () => {
    if (inFlight.current) return;
    const problem = passwordProblem(current, next, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      clearFields();
      toast('Password changed. Use the new password the next time you sign in.');
      onClose();
    } catch (e) {
      setError(describeFailure(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal title="Change password" onClose={close} dismissible={!busy}
      footer={<>
        <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </>}>
      <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); void submit(); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div className="error-box" role="alert">{error}</div>}
        <Field label="Current password">
          <input className="input" type="password" name="current-password" autoComplete="current-password"
            value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus disabled={busy} />
        </Field>
        <Field label={`New password (at least ${MIN_PASSWORD_LENGTH} characters)`}>
          <input className="input" type="password" name="new-password" autoComplete="new-password"
            value={next} onChange={(e) => setNext(e.target.value)} disabled={busy} />
        </Field>
        <Field label="Confirm new password">
          <input className="input" type="password" name="confirm-new-password" autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={busy} />
        </Field>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
