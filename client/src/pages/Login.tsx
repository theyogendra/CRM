import { LayoutGrid } from 'lucide-react';
import { useState } from 'react';
import { Field } from '../components/ui';
import { api, auth, type AuthUser } from '../lib/api';

export default function Login({ onLogin }: { onLogin: (u: AuthUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ token: string; user: AuthUser }>('/auth/login', { email, password });
      auth.set(r.token);
      onLogin(r.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark"><LayoutGrid size={15} /></div>
          Dealstack CRM
        </div>
        <div>
          <h1 className="page-title">Welcome back</h1>
          <div className="page-sub">Sign in to manage customers, GST invoices and follow-ups.</div>
        </div>
        {error && <div className="error-box">{error}</div>}
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <Field label="Password">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <button className="btn btn-primary" style={{ justifyContent: 'center', height: 40 }} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="small dim">Demo login is listed in the README (from the seed script).</div>
      </form>
    </div>
  );
}
