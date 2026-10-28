import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { inr, toInputDate } from '../lib/format';
import { previewTotals } from '../lib/gst';
import { useApi } from '../lib/hooks';
import type { Company, Customer, LineItem, Product, Proposal } from '../lib/types';
import LineItemsEditor, { blankItem } from './LineItemsEditor';
import { toApiItems } from './DocumentEditor';
import { Field, Modal, useToast } from './ui';
import { useCanManageCatalog } from '../lib/session';

const STAGES = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'];
const DEFAULT_CONTENT = 'Objective:\n\nScope of work:\n- \n\nDeliverables & timeline:\n- \n\nCommercials:\n- Prices exclusive of GST\n- Payment terms: ';

type Detail = Proposal & { items?: LineItem[]; isInterState?: boolean };

/** Loads the proposal (with its lines) before showing the form, so existing lines are editable. */
export default function ProposalForm({ p, onClose, onSaved }: { p?: Proposal | null; onClose: () => void; onSaved: () => void }) {
  const { data: detail, loading } = useApi<Detail>(p ? `/proposals/${p.id}` : null);
  if (p && (loading || !detail)) {
    return <Modal title={`Edit ${p.number}`} onClose={onClose}><div className="loading">Loading…</div></Modal>;
  }
  return <ProposalFormBody key={detail?.id ?? 'new'} p={detail ?? null} onClose={onClose} onSaved={onSaved} />;
}

function ProposalFormBody({ p, onClose, onSaved }: { p: Detail | null; onClose: () => void; onSaved: () => void }) {
  const { data: customers } = useApi<Customer[]>('/customers');
  const { data: products, reload: reloadProducts } = useApi<Product[]>('/products');
  const { data: company } = useApi<Company>('/settings/company');
  const canManageCatalog = useCanManageCatalog();
  const toast = useToast();
  const [items, setItems] = useState<LineItem[]>(p?.items?.length ? p.items.map((it) => ({ ...it })) : []);
  const [f, setF] = useState({
    title: p?.title ?? '', customerId: p?.customerId ?? '', value: p?.value ?? 0, status: p?.status ?? 'DRAFT',
    validUntil: toInputDate(p?.validUntil) || new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    content: p?.content ?? DEFAULT_CONTENT,
  });
  const [busy, setBusy] = useState(false);

  const customer = customers?.find((c) => c.id === f.customerId);
  const buyerState = customer ? customer.stateCode || customer.gstin.slice(0, 2) : '';
  const isInterState = Boolean(buyerState && company?.stateCode && buyerState !== company.stateCode);
  const preview = useMemo(() => (items.length ? previewTotals(items, 0, 0, isInterState) : null), [items, isInterState]);

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        title: f.title,
        customerId: f.customerId,
        status: f.status,
        validUntil: f.validUntil,
        content: f.content,
        // with line items the server calculates the value; without them the typed value is kept
        ...(items.length ? { items: toApiItems(items) } : { items: [], value: Number(f.value) || 0 }),
      };
      if (p) await api.put(`/proposals/${p.id}`, body); else await api.post('/proposals', body);
      toast('Proposal saved');
      onSaved();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal wide title={p ? `Edit ${p.number}` : 'New proposal'} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy || !f.title || !f.customerId}>Save</button>
      </>}>
      <div className="form-grid">
        <Field label="Title *" className="span-all"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus /></Field>
        <Field label="Customer *" className="span-2">
          <select className="select" value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}>
            <option value="">Select…</option>
            {customers?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Valid until"><input className="input" type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></Field>
        <Field label="Stage">
          <select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
      </div>

      <div className="small muted">Line items (optional). With items, the value below is calculated from them including GST.</div>
      <LineItemsEditor
        items={items}
        onChange={setItems}
        products={products ?? []}
        canManageCatalog={canManageCatalog}
        onCatalogChanged={() => void reloadProducts()}
      />
      {items.length === 0 ? (
        <Field label="Estimated value (₹)"><input className="input" type="number" min={0} value={f.value} onChange={(e) => setF({ ...f, value: Number(e.target.value) })} /></Field>
      ) : (
        <div className="small"><strong>Estimated value: {inr(preview?.total ?? 0)}</strong> <span className="dim">(preview, incl. GST — the server recalculates on save)</span></div>
      )}

      <Field label="Proposal content"><textarea className="textarea" rows={10} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} /></Field>
      {items.length === 0 && <span className="small dim">Add the first line to switch from a typed value to calculated totals.</span>}
      {items.length === 0 && <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setItems([blankItem()])}>Use line items</button>}
    </Modal>
  );
}
