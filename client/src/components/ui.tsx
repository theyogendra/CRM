import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { STATUS_COLOR } from '../lib/format';

export function Badge({ status, children }: { status?: string; children?: ReactNode }) {
  return <span className={`badge ${STATUS_COLOR[status ?? ''] ?? ''}`}>{children ?? status?.replace('_', ' ')}</span>;
}

export function PageHead({ icon, title, sub, actions }: { icon: ReactNode; title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="page-icon">{icon}</div>
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <div className="page-sub">{sub}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

/**
 * Dialog rendered into document.body (a portal), so it is positioned against the browser window
 * and not against whichever element it was opened from. Locks page scroll while open, closes on
 * Escape or a backdrop click, and can be made non-dismissable while work is in progress.
 */
export function Modal({ title, onClose, children, footer, wide, dismissible = true }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; dismissible?: boolean;
}) {
  const close = () => { if (dismissible) onClose(); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, dismissible]);

  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost icon-btn" onClick={close} aria-label="Close" disabled={!dismissible}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className ?? ''}`}>
      {label}
      {children}
    </label>
  );
}

/** Two-step delete button: first click arms it, second click confirms (no browser confirm dialogs). */
export function ConfirmButton({ onConfirm, children, label = 'Confirm?' }: { onConfirm: () => void; children: ReactNode; label?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={`btn btn-sm btn-danger ${armed ? '' : 'btn-ghost'}`}
      onClick={(e) => {
        e.stopPropagation();
        if (armed) onConfirm();
        else setArmed(true);
      }}
    >
      {armed ? label : children}
    </button>
  );
}

// ---------- toasts ----------
interface Toast { id: number; text: ReactNode; error?: boolean }
const ToastCtx = createContext<(text: ReactNode, error?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: ReactNode, error?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), error ? 6000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.error ? 'error' : ''}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

export function Loading() {
  return <div className="loading">Loading…</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
