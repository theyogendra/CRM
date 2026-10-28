import { useState } from 'react';
import { api } from '../lib/api';
import { INDIAN_STATES } from '../lib/format';
import type { Customer } from '../lib/types';
import { Field, Modal, useToast } from './ui';

const EMPTY: Partial<Customer> = {
  name: '', contactPerson: '', email: '', phone: '', whatsapp: '', gstin: '', address: '', city: '', state: '', stateCode: '',
  pincode: '', shipToSame: true, shipAddress: '', status: 'LEAD', source: '', notes: '',
};

export default function CustomerForm({ customer, onClose, onSaved }: {
  customer?: Customer | null; onClose: () => void; onSaved: (c: Customer) => void;
}) {
  const [f, setF] = useState<Partial<Customer>>(customer ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = <K extends keyof Customer>(k: K, v: Customer[K]) => setF((x) => ({ ...x, [k]: v }));

  const onGstin = (v: string) => {
    const g = v.toUpperCase();
    set('gstin', g);
    // the first two GSTIN digits are the state code
    const st = INDIAN_STATES.find(([code]) => code === g.slice(0, 2));
    if (st) setF((x) => ({ ...x, gstin: g, stateCode: st[0], state: st[1] }));
  };

  const save = async () => {
    setBusy(true);
    try {
      const { id, createdAt: _c, billed: _b, outstanding: _o, ...body } = f as Customer;
      const saved = id ? await api.put<Customer>(`/customers/${id}`, body) : await api.post<Customer>('/customers', body);
      toast(id ? 'Customer updated' : 'Customer added');
      onSaved(saved);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={customer ? 'Edit customer' : 'New customer'} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy || !f.name}>Save customer</button>
      </>}>
      <div className="form-grid">
        <Field label="Business name *" className="span-2"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
        <Field label="Contact person"><input className="input" value={f.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} /></Field>
        <Field label="Status">
          <select className="select" value={f.status} onChange={(e) => set('status', e.target.value as Customer['status'])}>
            <option value="LEAD">Lead</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
          </select>
        </Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="WhatsApp number"><input className="input" placeholder="Same as phone if empty" value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="GSTIN"><input className="input" value={f.gstin} maxLength={15} onChange={(e) => onGstin(e.target.value)} /></Field>
        <Field label="Address" className="span-all"><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="City"><input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field label="State (place of supply)">
          <select className="select" value={f.stateCode} onChange={(e) => {
            const st = INDIAN_STATES.find(([c]) => c === e.target.value);
            setF((x) => ({ ...x, stateCode: e.target.value, state: st?.[1] ?? '' }));
          }}>
            <option value="">Select state</option>
            {INDIAN_STATES.map(([c, n]) => <option key={c} value={c}>{n} ({c})</option>)}
          </select>
        </Field>
        <Field label="Pincode"><input className="input" value={f.pincode} onChange={(e) => set('pincode', e.target.value)} /></Field>
        <Field label="Lead source"><input className="input" placeholder="Referral, IndiaMART…" value={f.source} onChange={(e) => set('source', e.target.value)} /></Field>
        <label className="check span-all">
          <input type="checkbox" checked={f.shipToSame} onChange={(e) => set('shipToSame', e.target.checked)} />
          Ship-to (consignee) address is the same as bill-to
        </label>
        {!f.shipToSame && (
          <Field label="Ship-to address" className="span-all">
            <textarea className="textarea" value={f.shipAddress} onChange={(e) => set('shipAddress', e.target.value)} />
          </Field>
        )}
        <Field label="Notes" className="span-all"><textarea className="textarea" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
