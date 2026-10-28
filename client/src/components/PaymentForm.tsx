import { useState } from 'react';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import { useApi } from '../lib/hooks';
import type { Invoice } from '../lib/types';
import { Field, Modal, useToast } from './ui';

export default function PaymentForm({ invoice, onClose, onSaved }: {
  invoice?: { id: string; number: string; total: number; amountPaid: number } | null; onClose: () => void; onSaved: () => void;
}) {
  // when no invoice is given, let the user pick any unpaid invoice
  const { data: open } = useApi<Invoice[]>(invoice ? null : '/invoices');
  const unpaid = open?.filter((i) => !['PAID', 'CANCELLED', 'DRAFT'].includes(i.status)) ?? [];
  const [invoiceId, setInvoiceId] = useState(invoice?.id ?? '');
  const target = invoice ?? unpaid.find((i) => i.id === invoiceId);
  const balance = target ? Math.round((target.total - target.amountPaid) * 100) / 100 : 0;
  const [f, setF] = useState({ amount: invoice ? String(balance) : '', date: new Date().toISOString().slice(0, 10), mode: 'UPI', reference: '', notes: '', sendThanks: true });
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const save = async () => {
    setBusy(true);
    try {
      await api.post('/payments', { ...f, invoiceId, amount: Number(f.amount) });
      toast(`Payment recorded${f.sendThanks ? ' · thank-you WhatsApp queued' : ''}`);
      onSaved();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={invoice ? `Record payment · ${invoice.number}` : 'Record payment'} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy || !invoiceId || !(Number(f.amount) > 0)}>Save payment</button>
      </>}>
      <div className="form-grid">
        {!invoice && (
          <Field label="Invoice" className="span-all">
            <select className="select" value={invoiceId} onChange={(e) => {
              setInvoiceId(e.target.value);
              const t = unpaid.find((i) => i.id === e.target.value);
              if (t) setF((x) => ({ ...x, amount: String(Math.round((t.total - t.amountPaid) * 100) / 100) }));
            }}>
              <option value="">Select unpaid invoice…</option>
              {unpaid.map((i) => <option key={i.id} value={i.id}>{i.number} — {i.customer.name} — due {inr(i.total - i.amountPaid)}</option>)}
            </select>
          </Field>
        )}
        <Field label={`Amount (balance ${inr(balance)})`}><input className="input" type="number" min={0} step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Mode">
          <select className="select" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
            {['UPI', 'BANK_TRANSFER', 'CASH', 'CHEQUE', 'CARD', 'OTHER'].map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select>
        </Field>
        <Field label="Reference / UTR"><input className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field label="Notes" className="span-all"><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <label className="check span-all">
          <input type="checkbox" checked={f.sendThanks} onChange={(e) => setF({ ...f, sendThanks: e.target.checked })} />
          Send a payment-received thank-you on WhatsApp
        </label>
      </div>
    </Modal>
  );
}
