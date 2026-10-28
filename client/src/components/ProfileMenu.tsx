import { ChevronDown, KeyRound, LogOut, Settings, UserRound } from 'lucide-react';
import ChangePasswordDialog from './ChangePasswordDialog';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, type AuthUser } from '../lib/api';
import { initials } from '../lib/format';

const ROLE_LABEL: Record<string, string> = { ADMIN: 'Administrator', STAFF: 'Sales staff' };

/**
 * Account dropdown in the top bar. Shows the signed-in user's real name, role and email, and
 * only the actions that user's permissions allow. Keyboard: Enter/Space/ArrowDown opens,
 * arrows move between items, Escape or Tab closes and returns focus to the trigger.
 */
export default function ProfileMenu({ user, onSignedOut }: { user: AuthUser; onSignedOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | HTMLAnchorElement | null)[]>([]);
  const nav = useNavigate();
  const menuId = useId();

  const canManageSettings = user.permissions.includes('settings:manage');
  const menuItems: { key: string; label: string; icon: ReactNode; run: () => void }[] = [
    ...(canManageSettings
      ? [{ key: 'settings', label: 'Company settings', icon: <Settings size={15} />, run: () => nav('/settings') }]
      : []),
    {
      key: 'password',
      label: 'Change password',
      icon: <KeyRound size={15} />,
      run: () => setChangingPassword(true),
    },
    {
      key: 'signout',
      label: 'Sign out',
      icon: <LogOut size={15} />,
      run: () => {
        auth.clear();
        onSignedOut();
      },
    },
  ];

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) close(false);
    };
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const move = (delta: number | 'first' | 'last') => {
    const list = items.current.filter(Boolean) as HTMLElement[];
    const idx = list.indexOf(document.activeElement as HTMLElement);
    const next = delta === 'first' ? 0 : delta === 'last' ? list.length - 1 : (idx + delta + list.length) % list.length;
    list[next]?.focus();
  };

  const onMenuKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); move('first'); }
    else if (e.key === 'End') { e.preventDefault(); move('last'); }
    else if (e.key === 'Tab') close(false);
  };

  return (
    <div className="profile" ref={wrap} style={{ position: 'relative' }}>
      <button
        ref={trigger}
        className="profile-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); }
        }}
      >
        <span className="avatar">{initials(user.name)}</span>
        <span className="profile-name">{user.name}</span>
        <ChevronDown size={14} aria-hidden />
      </button>

      {open && (
        <div id={menuId} role="menu" aria-label="Account" className="profile-menu card" onKeyDown={onMenuKey}>
          <div className="profile-head">
            <UserRound size={18} aria-hidden />
            <div style={{ minWidth: 0 }}>
              <div className="strong" data-testid="profile-name">{user.name}</div>
              <div className="small dim" data-testid="profile-email">{user.email}</div>
              <span className="badge violet" data-testid="profile-role">{ROLE_LABEL[user.role] ?? user.role}</span>
            </div>
          </div>
          {menuItems.map((item, i) => (
            <button
              key={item.key}
              role="menuitem"
              className="profile-item"
              ref={(el) => { items.current[i] = el; }}
              onClick={() => { setOpen(false); item.run(); }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}

      {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
    </div>
  );
}
