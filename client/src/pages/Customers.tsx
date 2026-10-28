import { Plus, Search, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CustomerForm from '../components/CustomerForm';
import { Badge, Empty, Loading, PageHead } from '../components/ui';
import { inr, initials } from '../lib/format';
import { useApi } from '../lib/hooks';
import type { Customer } from '../lib/types';

export default function Customers() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const status = params.get('status') ?? '';
  const [query, setQuery] = useState(q);
  const [form, setForm] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setQ(params.get('q') ?? ''), [params]);

  const { data, loading, reload } = useApi<Customer[]>(`/customers?q=${encodeURIComponent(query)}&status=${status}`);
  const setStatus = (s: string) => {
    const p = new URLSearchParams(params);
    if (s) p.set('status', s); else p.delete('status');
    setParams(p);
  };

  return (
    <>
      <PageHead icon={<Users size={20} />} title="Customers" sub={`${data?.length ?? 0} records`}
        actions={<button className="btn btn-primary" onClick={() => setForm(true)}><Plus size={15} /> Add customer</button>} />
      <div className="card">
        <div className="toolbar">
          <div className="search"><Search size={15} /><input placeholder="Search name, phone, GSTIN, city" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="tabs">
            {[['', 'All'], ['ACTIVE', 'Active'], ['LEAD', 'Leads'], ['INACTIVE', 'Inactive']].map(([v, l]) => (
              <button key={v} className={`tab ${status === v ? 'active' : ''}`} onClick={() => setStatus(v)}>{l}</button>
            ))}
          </div>
        </div>
        {loading && !data ? <Loading /> : data?.length === 0 ? <Empty>No customers found</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Customer</th><th>Contact</th><th>Location</th><th>GSTIN</th><th>Status</th><th className="num">Billed</th><th className="num">Outstanding</th></tr></thead>
              <tbody>
                {data?.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => nav(`/customers/${c.id}`)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="avatar" style={{ width: 30, height: 30 }}>{initials(c.name)}</div>
                        <div><div className="strong">{c.name}</div><div className="small dim">{c.source}</div></div>
                      </div>
                    </td>
                    <td><div>{c.contactPerson || '—'}</div><div className="small dim">{c.whatsapp || c.phone}</div></td>
                    <td>{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                    <td className="small muted">{c.gstin || 'Unregistered'}</td>
                    <td><Badge status={c.status} /></td>
                    <td className="num">{inr(c.billed ?? 0, 0)}</td>
                    <td className={`num ${(c.outstanding ?? 0) > 0 ? 'down' : 'dim'}`}>{inr(c.outstanding ?? 0, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {form && <CustomerForm onClose={() => setForm(false)} onSaved={() => { setForm(false); void reload(); }} />}
    </>
  );
}
