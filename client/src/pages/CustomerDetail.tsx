import { ArrowLeft, Building2, Mail, MapPin, MessageCircle, Pencil, Phone, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CustomerForm from '../components/CustomerForm';
import { Badge, ConfirmButton, Empty, Loading, PageHead, useToast } from '../components/ui';
import WhatsAppComposer from '../components/WhatsAppComposer';
import { api } from '../lib/api';
import { fmtDate, fmtDateTime, inr } from '../lib/format';
import { useApi } from '../lib/hooks';
import type { Customer, Invoice, Message, Payment, Proposal, Quotation } from '../lib/types';

interface Detail extends Customer {
  invoices: Invoice[]; quotations: Quotation[]; proposals: Proposal[]; payments: Payment[];
  messages: Message[]; activities: { id: string; text: string; createdAt: string }[];
}

const TABS = ['Invoices', 'Quotations', 'Proposals', 'Payments', 'WhatsApp', 'Activity'] as const;

export default function CustomerDetail() {
  const { id } = useParams();
  const { data: c, loading, reload } = useApi<Detail>(`/customers/${id}`);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Invoices');
  const [edit, setEdit] = useState(false);
  const [wa, setWa] = useState(false);
  const nav = useNavigate();
  const toast = useToast();

  if (!c) return loading ? <Loading /> : <Empty>Customer not found</Empty>;

  const live = c.invoices.filter((i) => !['CANCELLED', 'DRAFT'].includes(i.status));
  const billed = live.reduce((s, i) => s + i.total, 0);
  const due = live.filter((i) => i.status !== 'PAID').reduce((s, i) => s + i.total - i.amountPaid, 0);
  const paid = c.payments.reduce((s, p) => s + p.amount, 0);

  const remove = async () => {
    await api.del(`/customers/${c.id}`);
    toast('Customer deleted');
    nav('/customers');
  };

  return (
    <>
      <Link to="/customers" className="muted small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><ArrowLeft size={14} /> Customers</Link>
      <PageHead icon={<Building2 size={20} />} title={c.name}
        sub={<><Badge status={c.status} />{c.gstin && <span className="badge">GSTIN {c.gstin}</span>}{c.source && <span className="badge">{c.source}</span>}</>}
        actions={<>
          <button className="btn btn-wa" onClick={() => setWa(true)}><MessageCircle size={15} /> WhatsApp</button>
          <button className="btn" onClick={() => nav(`/quotations?new=1&customer=${c.id}`)}>New quotation</button>
          <button className="btn btn-primary" onClick={() => nav(`/invoices?new=1&customer=${c.id}`)}>New invoice</button>
          <button className="btn icon-btn" onClick={() => setEdit(true)} title="Edit"><Pencil size={15} /></button>
          <ConfirmButton onConfirm={remove} label="Delete?"><Trash2 size={15} /></ConfirmButton>
        </>} />

      <div className="grid cols-2">
        <div className="card card-pad" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="stat-pill"><span className="small muted">Total billed</span><b>{inr(billed, 0)}</b></div>
          <div className="stat-pill"><span className="small muted">Received</span><b className="up">{inr(paid, 0)}</b></div>
          <div className="stat-pill"><span className="small muted">Balance due</span><b className={due > 0 ? 'down' : ''}>{inr(due, 0)}</b></div>
          <div className="stat-pill"><span className="small muted">Invoices</span><b>{c.invoices.length}</b></div>
          <div className="stat-pill"><span className="small muted">Open quotes</span><b>{c.quotations.filter((q) => ['SENT', 'DRAFT'].includes(q.status)).length}</b></div>
        </div>
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="strong">{c.contactPerson || 'No contact person'}</div>
          <div className="muted small" style={{ display: 'flex', gap: 8 }}><Phone size={14} /> {c.phone || '—'} {c.whatsapp && c.whatsapp !== c.phone && `· WA ${c.whatsapp}`}</div>
          <div className="muted small" style={{ display: 'flex', gap: 8 }}><Mail size={14} /> {c.email || '—'}</div>
          <div className="muted small" style={{ display: 'flex', gap: 8 }}><MapPin size={14} /> {[c.address, c.city, c.state, c.pincode].filter(Boolean).join(', ') || '—'}</div>
          {c.notes && <div className="small" style={{ marginTop: 4 }}>{c.notes}</div>}
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="tabs">
            {TABS.map((t) => <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
          </div>
        </div>
        <div className="table-wrap">
          {tab === 'Invoices' && (c.invoices.length === 0 ? <Empty>No invoices yet</Empty> : (
            <table className="table">
              <thead><tr><th>Number</th><th>Date</th><th>Due</th><th>Status</th><th className="num">Total</th><th className="num">Balance</th></tr></thead>
              <tbody>{c.invoices.map((i) => (
                <tr key={i.id} className="clickable" onClick={() => nav(`/invoices/${i.id}`)}>
                  <td className="strong">{i.number}</td><td>{fmtDate(i.date)}</td><td>{fmtDate(i.dueDate)}</td>
                  <td><Badge status={i.status} /></td><td className="num">{inr(i.total)}</td><td className="num">{inr(i.total - i.amountPaid)}</td>
                </tr>))}
              </tbody>
            </table>))}
          {tab === 'Quotations' && (c.quotations.length === 0 ? <Empty>No quotations yet</Empty> : (
            <table className="table">
              <thead><tr><th>Number</th><th>Date</th><th>Valid until</th><th>Status</th><th className="num">Total</th></tr></thead>
              <tbody>{c.quotations.map((q) => (
                <tr key={q.id} className="clickable" onClick={() => nav(`/quotations/${q.id}`)}>
                  <td className="strong">{q.number}</td><td>{fmtDate(q.date)}</td><td>{fmtDate(q.validUntil)}</td>
                  <td><Badge status={q.status} /></td><td className="num">{inr(q.total)}</td>
                </tr>))}
              </tbody>
            </table>))}
          {tab === 'Proposals' && (c.proposals.length === 0 ? <Empty>No proposals yet</Empty> : (
            <table className="table">
              <thead><tr><th>Number</th><th>Title</th><th>Valid until</th><th>Status</th><th className="num">Value</th></tr></thead>
              <tbody>{c.proposals.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => nav('/proposals')}>
                  <td className="strong">{p.number}</td><td>{p.title}</td><td>{fmtDate(p.validUntil)}</td>
                  <td><Badge status={p.status} /></td><td className="num">{inr(p.value, 0)}</td>
                </tr>))}
              </tbody>
            </table>))}
          {tab === 'Payments' && (c.payments.length === 0 ? <Empty>No payments yet</Empty> : (
            <table className="table">
              <thead><tr><th>Date</th><th>Invoice</th><th>Mode</th><th>Reference</th><th className="num">Amount</th></tr></thead>
              <tbody>{c.payments.map((p) => (
                <tr key={p.id}><td>{fmtDate(p.date)}</td><td>{p.invoice?.number}</td><td>{p.mode.replace('_', ' ')}</td>
                  <td className="muted">{p.reference || '—'}</td><td className="num up">{inr(p.amount)}</td></tr>))}
              </tbody>
            </table>))}
          {tab === 'WhatsApp' && (c.messages.length === 0 ? <Empty>No messages yet</Empty> : (
            <div className="list" style={{ padding: '8px 0' }}>
              {c.messages.map((m) => (
                <div className="list-item" key={m.id} style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div className="small dim" style={{ marginBottom: 6 }}>{fmtDateTime(m.createdAt)} · {m.kind.replace(/_/g, ' ').toLowerCase()} {m.automatic && '· auto'}</div>
                    <div className="wa-bubble" style={{ maxWidth: 560 }}>{m.body}</div>
                  </div>
                  <Badge status={m.status}>{m.status === 'LINK' ? 'click-to-send' : m.status}</Badge>
                  {m.link && <a className="btn btn-sm" href={m.link} target="_blank" rel="noreferrer">Open</a>}
                </div>
              ))}
            </div>))}
          {tab === 'Activity' && (
            <div className="list" style={{ padding: '8px 0' }}>
              {c.activities.map((a) => (
                <div className="list-item" key={a.id}><span className="dot" /><span style={{ flex: 1 }}>{a.text}</span><span className="small dim">{fmtDateTime(a.createdAt)}</span></div>
              ))}
              {c.activities.length === 0 && <Empty>No activity yet</Empty>}
            </div>
          )}
        </div>
      </div>

      {edit && <CustomerForm customer={c} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); void reload(); }} />}
      {wa && <WhatsAppComposer title={`WhatsApp ${c.name}`} initial={`Hi ${c.contactPerson || c.name}, `} customerId={c.id}
        onClose={() => setWa(false)} onSent={reload} />}
    </>
  );
}
