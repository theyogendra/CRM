import { ArrowLeft, CheckCircle2, CreditCard, FileText, MessageCircle, Pencil, Printer, Receipt, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DocumentEditor from '../components/DocumentEditor';
import GstDocument from '../components/GstDocument';
import PaymentForm from '../components/PaymentForm';
import { Badge, ConfirmButton, Empty, Loading, PageHead, useToast } from '../components/ui';
import WhatsAppComposer from '../components/WhatsAppComposer';
import { api } from '../lib/api';
import { fmtDate, inr } from '../lib/format';
import { useApi } from '../lib/hooks';
import type { Invoice, PrintableDoc, Quotation } from '../lib/types';

const COPIES = ['ORIGINAL FOR RECIPIENT', 'DUPLICATE FOR TRANSPORTER', 'TRIPLICATE FOR SUPPLIER'];

export default function DocumentView({ kind }: { kind: 'invoice' | 'quotation' }) {
  const { id } = useParams();
  const base = kind === 'invoice' ? '/invoices' : '/quotations';
  const { data: doc, loading, reload } = useApi<(Invoice & Quotation) & PrintableDoc>(`${base}/${id}`);
  const [copies, setCopies] = useState<string[]>([COPIES[0]]);
  const [edit, setEdit] = useState(false);
  const [pay, setPay] = useState(false);
  const [wa, setWa] = useState(false);
  const nav = useNavigate();
  const toast = useToast();

  if (!doc) return loading ? <Loading /> : <Empty>Not found</Empty>;
  const isInv = kind === 'invoice';
  const balance = doc.total - (doc.amountPaid ?? 0);
  // Issued invoices and accepted/converted quotations are records; the server refuses edits too.
  const locked = isInv ? doc.status !== 'DRAFT' : ['ACCEPTED', 'CONVERTED'].includes(doc.status);
  const lockMessage = isInv
    ? `This invoice has been issued (${doc.status.toLowerCase()}), so its lines and amounts can't be changed. Payments can still be recorded.`
    : doc.status === 'CONVERTED'
      ? 'This quotation has been converted to an invoice and is locked.'
      : doc.status === 'ACCEPTED' ? 'This quotation was accepted and is locked.' : '';

  const setStatus = async (status: string) => {
    await api.patch(`/quotations/${doc.id}/status`, { status });
    toast(`Marked ${status.toLowerCase()}`);
    void reload();
  };
  const convert = async () => {
    try {
      const inv = await api.post<{ id: string; number: string }>(`/quotations/${doc.id}/convert`);
      toast(`Invoice ${inv.number} created`);
      nav(`/invoices/${inv.id}`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const remove = async () => {
    await api.del(`${base}/${doc.id}`);
    toast('Deleted');
    nav(base);
  };

  return (
    <>
      <Link to={base} className="muted small no-print" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <ArrowLeft size={14} /> {isInv ? 'Invoices' : 'Quotations'}
      </Link>
      <div className="no-print">
        <PageHead icon={isInv ? <Receipt size={20} /> : <FileText size={20} />} title={doc.number}
          sub={<>
            <Badge status={doc.status} />
            <Link to={`/customers/${doc.customerId}`} className="badge">{doc.customer.name}</Link>
            <span className="badge">{doc.isInterState ? 'IGST' : 'CGST + SGST'}</span>
            {isInv && doc.quotation && <Link to={`/quotations/${doc.quotation.id}`} className="badge violet">from {doc.quotation.number}</Link>}
            {!isInv && doc.invoice && <Link to={`/invoices/${doc.invoice.id}`} className="badge violet">→ {doc.invoice.number}</Link>}
          </>}
          actions={<>
            <button className="btn btn-wa" onClick={() => setWa(true)}><MessageCircle size={15} /> Send on WhatsApp</button>
            {isInv && balance > 0.009 && doc.status !== 'CANCELLED' && (
              <button className="btn btn-primary" onClick={() => setPay(true)}><CreditCard size={15} /> Record payment</button>
            )}
            {!isInv && !doc.invoice && <>
              {doc.status !== 'ACCEPTED' && <button className="btn" onClick={() => setStatus('ACCEPTED')}><CheckCircle2 size={15} /> Accepted</button>}
              {doc.status !== 'REJECTED' && <button className="btn" onClick={() => setStatus('REJECTED')}><XCircle size={15} /> Rejected</button>}
              <button className="btn btn-primary" onClick={convert}><Receipt size={15} /> Convert to invoice</button>
            </>}
            <button className="btn" onClick={() => window.print()}><Printer size={15} /> Print / PDF</button>
            {!locked && <>
              <button className="btn icon-btn" onClick={() => setEdit(true)} title="Edit"><Pencil size={15} /></button>
              <ConfirmButton onConfirm={remove} label="Delete?"><Trash2 size={15} /></ConfirmButton>
            </>}
          </>}
        />
      </div>

      {locked && (
        <div className="card card-pad no-print small" role="status" style={{ display: 'flex', gap: 10, alignItems: 'center', borderColor: 'var(--amber)' }}>
          🔒 {lockMessage}
        </div>
      )}

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div>
          {(isInv ? copies : ['']).map((c) => <GstDocument key={c} doc={doc} kind={kind} copy={c} />)}
        </div>
        <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="totals" style={{ width: '100%' }}>
              <div><span className="muted">Date</span><span>{fmtDate(doc.date)}</span></div>
              <div><span className="muted">{isInv ? 'Due date' : 'Valid until'}</span><span>{fmtDate(isInv ? doc.dueDate : doc.validUntil)}</span></div>
              <div><span className="muted">Taxable</span><span>{inr(doc.taxable)}</span></div>
              <div><span className="muted">GST</span><span>{inr(doc.cgst + doc.sgst + doc.igst)}</span></div>
              <div className="grand"><span>Total</span><span>{inr(doc.total)}</span></div>
              {isInv && <>
                <div><span className="muted">Received</span><span className="up">{inr(doc.amountPaid)}</span></div>
                <div><span className="muted">Balance</span><span className={balance > 0 ? 'down' : ''}>{inr(balance)}</span></div>
              </>}
            </div>
          </div>
          {isInv && (
            <div className="card card-pad">
              <div className="strong" style={{ marginBottom: 8 }}>Print copies</div>
              {COPIES.map((c) => (
                <label key={c} className="check" style={{ display: 'flex', marginBottom: 6 }}>
                  <input type="checkbox" checked={copies.includes(c)}
                    onChange={(e) => setCopies((x) => (e.target.checked ? COPIES.filter((k) => x.includes(k) || k === c) : x.filter((k) => k !== c)))} />
                  {c.toLowerCase()}
                </label>
              ))}
            </div>
          )}
          {isInv && doc.payments && doc.payments.length > 0 && (
            <div className="card">
              <div className="card-head"><h3 className="card-title">Payments</h3></div>
              <div className="list" style={{ paddingTop: 8 }}>
                {doc.payments.map((p) => (
                  <div className="list-item" key={p.id}>
                    <div style={{ flex: 1 }}><div>{inr(p.amount)}</div><div className="small dim">{fmtDate(p.date)} · {p.mode.replace('_', ' ')} {p.reference && `· ${p.reference}`}</div></div>
                    <ConfirmButton onConfirm={async () => { await api.del(`/payments/${p.id}`); void reload(); }}><Trash2 size={13} /></ConfirmButton>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {edit && <DocumentEditor kind={kind} doc={doc} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); void reload(); }} />}
      {pay && <PaymentForm invoice={doc} onClose={() => setPay(false)} onSaved={() => { setPay(false); void reload(); }} />}
      {wa && <WhatsAppComposer title={`Share ${doc.number} on WhatsApp`} initial="" endpoint={`${base}/${doc.id}/send`}
        onClose={() => setWa(false)} onSent={reload} />}
    </>
  );
}
