import {
  CreditCard, FileSignature, FileText, LayoutGrid, LogOut, MessageCircle, Package, Receipt, Search, Settings, Users,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, auth, type AuthUser } from '../lib/api';
import NotificationsMenu from './NotificationsMenu';
import ProfileMenu from './ProfileMenu';

interface Counts { overdue: number; quotes: number }

function Item({ to, icon, label, badge }: { to: string; icon: ReactNode; label: string; badge?: number }) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      {icon}
      {label}
      {badge ? <span className="nav-badge">{badge}</span> : null}
    </NavLink>
  );
}

export default function Layout({ user }: { user: AuthUser }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [counts, setCounts] = useState<Counts>({ overdue: 0, quotes: 0 });
  const canManageSettings = user.permissions.includes('settings:manage');

  const signOut = () => {
    auth.clear();
    window.location.href = '/login';
  };

  useEffect(() => {
    api.get<{ kpis: { outstanding: { overdueCount: number } }; pipeline: { count: number }[] }>('/dashboard?range=1M')
      .then((d) => setCounts({ overdue: d.kpis.outstanding.overdueCount, quotes: d.pipeline[1]?.count ?? 0 }))
      .catch(() => {});
  }, []);

  return (
    <div className="shell">
      <aside className="sidebar">
        <Item to="/" icon={<LayoutGrid size={17} />} label="Overview" />
        <Item to="/customers" icon={<Users size={17} />} label="Customers" />

        <div className="nav-group">Sales &amp; Operations</div>
        <Item to="/proposals" icon={<FileSignature size={17} />} label="Proposals" />
        <Item to="/quotations" icon={<FileText size={17} />} label="Quotations" badge={counts.quotes} />
        <Item to="/invoices" icon={<Receipt size={17} />} label="GST Invoices" badge={counts.overdue} />
        <Item to="/payments" icon={<CreditCard size={17} />} label="Payments" />
        <Item to="/products" icon={<Package size={17} />} label="Products" />

        <div className="nav-group">Engagement</div>
        <Item to="/whatsapp" icon={<MessageCircle size={17} />} label="WhatsApp" />

        <div className="sidebar-foot">
          {canManageSettings && <Item to="/settings" icon={<Settings size={17} />} label="Settings" />}
          <button
            className="nav-link btn-ghost"
            style={{ width: '100%', border: 0, background: 'none', cursor: 'pointer' }}
            onClick={signOut}
          >
            <LogOut size={17} /> Log out
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); nav(`/customers?q=${encodeURIComponent(q)}`); }}>
            <Search size={15} />
            <input aria-label="Search customers" placeholder="Search customers, GSTIN, city…" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <div className="topbar-right">
            <NotificationsMenu />
            <ProfileMenu user={user} onSignedOut={signOut} />
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
