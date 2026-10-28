import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { inr, toInputDate } from '../lib/format';
import { previewTotals } from '../lib/gst';
import { useApi } from '../lib/hooks';
import type { Company, Customer, Invoice, LineItem, Product, Quotation } from '../lib/types';
import LineItemsEditor, { blankItem } from './LineItemsEditor';
import { Field, Modal, useToast } from './ui';
import { useCanManageCatalog } from '../lib/session';

type Kind = 'invoice' | 'quotation';
const addDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** What the server needs for each line. Catalog lines send only the reference and the adjustable fields. */
export function toApiItems(items: LineItem[]) {
  return items
    .filter((it) => it.productId || it.description.trim())
    .map((it) => (it.productId
      ? { productId: it.productId, quantity: it.quantity, discount: it.discount }
      : { description: it.description.trim(), hsn: it.hsn, unit: it.unit, quantity: it.quantity, rate: it.rate, discount: it.discount, gstRate: it.gstRate }));
}

export default function DocumentEditor({ kind, doc, customerId, onClose, onSaved }: {
  kind: Kind; doc?: Invoice | Quotation | null; customerId?: string; onClose: () => void; onSaved: (id: string) => void;
}) {
  const { data: customers } = useApi<Customer[]>('/customers');
  const { data: products, reload: reloadProducts } = useApi<Product[]>('/products');
  const { data: company } = useApi<Company>('/settings/company');
  const canManageCatalog = useCanManageCatalog();
  const toast = useToast();
  const inv = kind === 'invoice' ? (doc as Invoice | undefined) : undefined;
  const qt = kind === 'quotation' ? (doc as Quotation | undefined) : undefined;

  const [f, setF] = useState({
    customerId: doc?.customerId ?? customerId ?? '',
    date: toInputDate(doc?.date) || new Date().toISOString().slice(0, 10),
    dueDate: inv ? toInputDate(inv.dueDate) : addDays(15),
    validUntil: qt ? toInputDate(qt.validUntil) : addDays(30),
    status: doc?.status ?? (kind === 'invoice' ? 'UNPAID' : 'DRAFT'),
    deliveryNote: inv?.deliveryNote ?? '',
    buyerOrderNo: inv?.buyerOrderNo ?? '',
    dispatchDocNo: inv?.dispatchDocNo ?? '',
    dispatchedThrough: inv?.dispatchedThrough ?? '',
    destination: inv?.destination ?? '',
    paymentTerms: inv?.paymentTerms ?? '',
    freight: doc?.freight ?? 0,
    freightGstRate: doc?.freightGstRate ?? 0,
    notes: doc?.notes ?? '',
  });
  const [items, setItems] = useState<LineItem[]>(
    doc?.items?.length ? doc.items.map((it) => ({ ...it })) : [blankItem()],
  );
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string | number) => setF((x) => ({ ...x, [k]: v }));

  const customer = customers?.find((c) => c.id === f.customerId);
  const buyerState = customer ? customer.stateCode || customer.gstin.slice(0, 2) : '';
  const isInterState = Boolean(buyerState && company?.stateCode && buyerState !== company.stateCode);
  // live preview only; the server recalculates every amount when the document is saved
  const t = useMemo(() => previewTotals(items, Number(f.freight) || 0, Number(f.freightGstRate) || 0, isInterState),
    [items, f.freight, f.freightGstRate, isInterState]);

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        ...f,
        status: kind === 'invoice' && !['DRAFT', 'UNPAID', 'CANCELLED'].includes(f.status) ? 'UNPAID' : f.status,
        items: toApiItems(items),
      };
      const base = kind === 'invoice' ? '/invoices' : '/quotations';
      const saved = doc ? await api.put<{ id: string }>(`${base}/${doc.id}`, body) : await api.post<{ id: string }>(base, body);
      toast(`${kind === 'invoice' ? 'Invoice' : 'Quotation'} saved`);
      onSaved(saved.id);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const title = `${doc ? 'Edit' : 'New'} ${kind === 'invoice' ? 'GST tax invoice' : 'quotation'}${doc ? ` ${doc.number}` : ''}`;

  return (
    <Modal wide title={title} onClose={onClose}
      footer={<>
        <span className="muted small" style={{ marginRight: 'auto', alignSelf: 'center' }}>
          {customer ? (isInterState ? `Inter-state supply → IGST (${customer.state || buyerState})` : `Intra-state supply → CGST + SGST`) : 'Select a customer'}
        </span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy || !f.customerId}>Save</button>
      </>}>
      <div className="form-grid">
        <Field label="Customer *" className="span-2">
          <select className="select" value={f.customerId} onChange={(e) => set('customerId', e.target.value)}>
            <option value="">Select customer…</option>
            {customers?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` — ${c.city}` : ''}</option>)}
          </select>
        </Field>
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
        {kind === 'invoice' ? (
          <Field label="Due date"><input className="input" type="date" value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Field>
        ) : (
          <Field label="Valid until"><input className="input" type="date" value={f.validUntil} onChange={(e) => set('validUntil', e.target.value)} /></Field>
        )}
        {kind === 'invoice' && <>
          <Field label="Delivery note"><input className="input" placeholder="387/2, 2 carton" value={f.deliveryNote} onChange={(e) => set('deliveryNote', e.target.value)} /></Field>
          <Field label="Buyer's order no."><input className="input" value={f.buyerOrderNo} onChange={(e) => set('buyerOrderNo', e.target.value)} /></Field>
          <Field label="Dispatched through"><input className="input" placeholder="SAFE EXPRESS" value={f.dispatchedThrough} onChange={(e) => set('dispatchedThrough', e.target.value)} /></Field>
          <Field label="Destination"><input className="input" value={f.destination} onChange={(e) => set('destination', e.target.value)} /></Field>
          <Field label="Dispatch doc no."><input className="input" value={f.dispatchDocNo} onChange={(e) => set('dispatchDocNo', e.target.value)} /></Field>
          <Field label="Mode / terms of payment"><input className="input" value={f.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} /></Field>
        </>}
        <Field label="Status">
          <select className="select" value={f.status} onChange={(e) => set('status', e.target.value)}>
            {(kind === 'invoice' ? ['DRAFT', 'UNPAID', 'CANCELLED'] : ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED']).map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>

      <LineItemsEditor
        items={items}
        onChange={setItems}
        products={products ?? []}
        canManageCatalog={canManageCatalog}
        onCatalogChanged={() => void reloadProducts()}
      />

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div className="form-grid" style={{ flex: 1, minWidth: 260 }}>
          <Field label="Freight / other charges (₹)"><input className="input" type="number" min={0} value={f.freight} onChange={(e) => set('freight', Number(e.target.value))} /></Field>
          <Field label="Freight GST % (0 = highest item rate)"><input className="input" type="number" min={0} value={f.freightGstRate} onChange={(e) => set('freightGstRate', Number(e.target.value))} /></Field>
          <Field label="Notes / remarks" className="span-all"><textarea className="textarea" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        </div>
        <div className="totals card card-pad">
          <div><span className="muted">Items total</span><span>{inr(t.subtotal)}</span></div>
          {Number(f.freight) > 0 && <div><span className="muted">Freight outward</span><span>{inr(Number(f.freight))}</span></div>}
          <div><span className="muted">Taxable value</span><span>{inr(t.taxable)}</span></div>
          {isInterState ? <div><span className="muted">IGST</span><span>{inr(t.igst)}</span></div> : <>
            <div><span className="muted">CGST</span><span>{inr(t.cgst)}</span></div>
            <div><span className="muted">SGST</span><span>{inr(t.sgst)}</span></div>
          </>}
          <div><span className="muted">Rounding</span><span>{t.roundOff >= 0 ? '+' : ''}{t.roundOff.toFixed(2)}</span></div>
          <div className="grand"><span>Total</span><span>{inr(t.total)}</span></div>
          <div className="small dim">Preview — the server recalculates on save.</div>
        </div>
      </div>
    </Modal>
  );
}
