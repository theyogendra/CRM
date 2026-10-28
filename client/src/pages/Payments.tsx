import { CreditCard, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import PaymentForm from '../components/PaymentForm';
import { Empty, Loading, PageHead } from '../components/ui';
import { fmtDate, inr } from '../lib/format';
import { useApi } from '../lib/hooks';
import type { Payment } from '../lib/types';

export default function Payments() {
  const { data, loading, reload } = useApi<Payment[]>('/payments');
  const [form, setForm] = useState(false);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const thisMonth = (data ?? []).filter((p) => new Date(p.date) >= monthStart).reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <PageHead icon={<CreditCard size={20} />} title="Payments"
        sub={<span>{inr(thisMonth, 0)} received this month · {data?.length ?? 0} receipts</span>}
        actions={<button className="btn btn-primary" onClick={() => setForm(true)}><Plus size={15} /> Record payment</button>} />
      <div className="card">
        {loading && !data ? <Loading /> : data?.length === 0 ? <Empty>No payments yet</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Customer</th><th>Invoice</th><th>Mode</th><th>Reference</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {data?.map((p) => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.date)}</td>
                    <td><Link to={`/customers/${p.customer?.id}`}>{p.customer?.name}</Link></td>
                    <td><Link to={`/invoices/${p.invoice?.id}`} className="strong">{p.invoice?.number}</Link></td>
                    <td><span className="badge">{p.mode.replace('_', ' ')}</span></td>
                    <td className="muted">{p.reference || '—'}</td>
                    <td className="num up">{inr(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {form && <PaymentForm onClose={() => setForm(false)} onSaved={() => { setForm(false); void reload(); }} />}
    </>
  );
}
