import { Save, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Field, Loading, PageHead, useToast } from '../components/ui';
import { api } from '../lib/api';
import { INDIAN_STATES } from '../lib/format';
import { useApi } from '../lib/hooks';
import type { Company } from '../lib/types';

export default function SettingsPage() {
  const { data } = useApi<Company & { id: number }>('/settings/company');
  const [f, setF] = useState<Company | null>(null);
  const toast = useToast();
  useEffect(() => { if (data) setF(data); }, [data]);
  if (!f) return <Loading />;

  const text = (k: keyof Company, label: string, cls = '') => (
    <Field label={label} className={cls}>
      <input className="input" value={String(f[k] ?? '')} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </Field>
  );
  const number = (k: keyof Company, label: string) => (
    <Field label={label}>
      <input className="input" type="number" min={0} value={Number(f[k])} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} />
    </Field>
  );

  const save = async () => {
    try {
      const { id: _id, ...body } = f as Company & { id?: number };
      await api.put('/settings/company', body);
      toast('Settings saved');
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <>
      <PageHead icon={<Settings size={20} />} title="Settings" sub="Company details printed on GST documents, numbering and follow-up automation."
        actions={<button className="btn btn-primary" onClick={save}><Save size={15} /> Save changes</button>} />

      <div className="card card-pad">
        <h3 className="card-title" style={{ marginBottom: 14 }}>Company (seller) details</h3>
        <div className="form-grid">
          {text('name', 'Company name', 'span-2')}
          {text('gstin', 'GSTIN/UIN')}
          {text('pan', "Company's PAN")}
          {text('address', 'Address', 'span-all')}
          {text('city', 'City')}
          <Field label="State">
            <select className="select" value={f.stateCode} onChange={(e) => {
              const st = INDIAN_STATES.find(([c]) => c === e.target.value);
              setF({ ...f, stateCode: e.target.value, state: st?.[1] ?? '' });
            }}>
              {INDIAN_STATES.map(([c, n]) => <option key={c} value={c}>{n} ({c})</option>)}
            </select>
          </Field>
          {text('pincode', 'Pincode')}
          {text('email', 'E-mail')}
          {text('phone', 'Phone')}
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="card-title" style={{ marginBottom: 14 }}>Bank details & declaration</h3>
        <div className="form-grid">
          {text('bankAccountName', "A/c holder's name")}
          {text('bankName', 'Bank name')}
          {text('bankAccountNo', 'A/c no.')}
          {text('bankBranchIfsc', 'Branch & IFS code')}
          <Field label="Declaration" className="span-all"><textarea className="textarea" value={f.declaration} onChange={(e) => setF({ ...f, declaration: e.target.value })} /></Field>
          <Field label="Default remarks (printed when an invoice has no notes)" className="span-all"><input className="input" value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} /></Field>
        </div>
      </div>

      <div className="grid cols-even">
        <div className="card card-pad">
          <h3 className="card-title" style={{ marginBottom: 14 }}>Document numbering</h3>
          <div className="small muted" style={{ marginBottom: 12 }}>Format: PREFIX/FY/NUMBER — e.g. {f.invoicePrefix}/26-27/{f.nextInvoiceNo}</div>
          <div className="form-grid">
            {text('invoicePrefix', 'Invoice prefix')}{number('nextInvoiceNo', 'Next invoice no.')}
            {text('quotationPrefix', 'Quotation prefix')}{number('nextQuotationNo', 'Next quotation no.')}
            {text('proposalPrefix', 'Proposal prefix')}{number('nextProposalNo', 'Next proposal no.')}
          </div>
        </div>
        <div className="card card-pad">
          <h3 className="card-title" style={{ marginBottom: 14 }}>WhatsApp automation</h3>
          <label className="check" style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={f.autoFollowUp} onChange={(e) => setF({ ...f, autoFollowUp: e.target.checked })} />
            Send follow-ups automatically
          </label>
          <div className="form-grid">
            {number('reminderDaysBefore', 'Remind N days before due')}
            {number('overdueEveryDays', 'Repeat overdue every N days')}
            {number('quotationFollowDays', 'Follow up quotes after N days')}
            {number('proposalFollowDays', 'Follow up proposals after N days')}
          </div>
        </div>
      </div>
    </>
  );
}
