import { Plus, Search } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fmtDate, inr } from '../lib/format';
import { useApi } from '../lib/hooks';
import type { Invoice, Quotation } from '../lib/types';
import DocumentEditor from './DocumentEditor';
import { Badge, Empty, Loading, PageHead } from './ui';

const STATUSES = {
  invoice: ['', 'UNPAID', 'PARTIAL', 'OVERDUE', 'PAID', 'DRAFT', 'CANCELLED'],
  quotation: ['', 'DRAFT', 'SENT', 'ACCEPTED', 'CONVERTED', 'REJECTED', 'EXPIRED'],
};

/** Shared list screen for GST invoices and quotations. */
export default function DocList({ kind, icon, title }: { kind: 'invoice' | 'quotation'; icon: ReactNode; title: string }) {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const [q, setQ] = useState('');
  const isInv = kind === 'invoice';
  const { data, loading, reload } = useApi<(Invoice & Quotation)[]>(`/${kind === 'invoice' ? 'invoices' : 'quotations'}?status=${status}`);
  const nav = useNavigate();
  const creating = params.get('new') === '1';

  const rows = useMemo(() => {
    const s = q.toLowerCase();
    return (data ?? []).filter((d) => !s || d.number.toLowerCase().includes(s) || d.customer.name.toLowerCase().includes(s));
  }, [data, q]);
  const total = rows.reduce((s, r) => s + r.total, 0);
  const due = isInv ? rows.filter((r) => r.status !== 'PAID' && r.status !== 'CANCELLED').reduce((s, r) => s + r.total - r.amountPaid, 0) : 0;

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    if (k !== 'new') p.delete('customer');
    setParams(p);
  };

  return (
    <>
      <PageHead icon={icon} title={title}
        sub={<><span>{rows.length} documents · {inr(total, 0)}</span>{isInv && <span className="down">· {inr(due, 0)} receivable</span>}</>}
        actions={<button className="btn btn-primary" onClick={() => setParam('new', '1')}><Plus size={15} /> New {isInv ? 'invoice' : 'quotation'}</button>} />
      <div className="card">
        <div className="toolbar">
          <div className="search"><Search size={15} /><input placeholder="Search number or customer" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="tabs">
            {STATUSES[kind].map((s) => (
              <button key={s} className={`tab ${status === s ? 'active' : ''}`} onClick={() => setParam('status', s)}>{s ? s.toLowerCase() : 'all'}</button>
            ))}
          </div>
        </div>
        {loading && !data ? <Loading /> : rows.length === 0 ? <Empty>Nothing here yet</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Number</th><th>Customer</th><th>Date</th><th>{isInv ? 'Due' : 'Valid until'}</th><th>Tax</th><th>Status</th>
                  <th className="num">Total</th>{isInv && <th className="num">Balance</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="clickable" onClick={() => nav(`/${isInv ? 'invoices' : 'quotations'}/${d.id}`)}>
                    <td className="strong">{d.number}</td>
                    <td>{d.customer.name}</td>
                    <td>{fmtDate(d.date)}</td>
                    <td>{fmtDate(isInv ? d.dueDate : d.validUntil)}</td>
                    <td className="small muted">{d.isInterState ? 'IGST' : 'CGST+SGST'}</td>
                    <td><Badge status={d.status} /></td>
                    <td className="num">{inr(d.total)}</td>
                    {isInv && <td className={`num ${d.total - d.amountPaid > 0.009 ? '' : 'dim'}`}>{inr(d.total - d.amountPaid)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {creating && (
        <DocumentEditor kind={kind} customerId={params.get('customer') ?? undefined}
          onClose={() => setParam('new', '')}
          onSaved={(id) => { void reload(); nav(`/${isInv ? 'invoices' : 'quotations'}/${id}`); }} />
      )}
    </>
  );
}
