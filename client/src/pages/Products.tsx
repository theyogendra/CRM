import { Archive, ArchiveRestore, Package, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Badge, Empty, Field, Loading, Modal, PageHead, useToast } from '../components/ui';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import { GST_RATES } from '../lib/gst';
import { useApi } from '../lib/hooks';
import type { Product } from '../lib/types';
import { useCanManageCatalog } from '../lib/session';

const EMPTY: Partial<Product> = { sku: '', name: '', hsn: '', unit: 'nos', rate: 0, gstRate: 18, description: '' };

/**
 * Reusable catalog. Users with catalog:write can add, edit and archive items; others can only
 * browse. Changing an item never changes documents that already used it.
 */
export default function Products() {
  const canWrite = useCanManageCatalog();
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const { data, loading, reload } = useApi<Product[]>(`/products?q=${encodeURIComponent(q)}${showArchived ? '&includeArchived=1' : ''}`);
  const [edit, setEdit] = useState<Partial<Product> | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const save = async () => {
    if (!edit) return;
    setSaving(true);
    try {
      const { id, archivedAt: _a, ...body } = edit as Product;
      if (id) await api.put(`/products/${id}`, body); else await api.post('/products', body);
      toast('Product saved');
      setEdit(null);
      void reload();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  const setArchived = async (p: Product, archive: boolean) => {
    try {
      await api.patch(`/products/${p.id}/${archive ? 'archive' : 'restore'}`, {});
      toast(archive ? `"${p.name}" archived — existing documents are unchanged` : `"${p.name}" restored`);
      void reload();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <>
      <PageHead icon={<Package size={20} />} title="Products & Services"
        sub="Reusable items for quotations, proposals and invoices. Price and GST are set here."
        actions={canWrite && <button className="btn btn-primary" onClick={() => setEdit(EMPTY)}><Plus size={15} /> Add item</button>} />
      <div className="card">
        <div className="toolbar">
          <div className="search"><Search size={15} /><input aria-label="Search items" placeholder="Search name, SKU or HSN" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <label className="check" style={{ marginLeft: 'auto' }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
          </label>
        </div>
        {loading && !data ? <Loading /> : data?.length === 0 ? <Empty>No items found</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>SKU</th><th>Name</th><th>HSN/SAC</th><th>Unit</th><th>GST</th><th className="num">Rate</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data?.map((p) => (
                  <tr key={p.id} className={canWrite ? 'clickable' : ''} onClick={() => canWrite && setEdit(p)}>
                    <td className="small">{p.sku || '—'}</td>
                    <td className="strong">{p.name}<div className="small dim">{p.description}</div></td>
                    <td>{p.hsn || '—'}</td><td>{p.unit}</td><td>{p.gstRate}%</td><td className="num">{inr(p.rate)}</td>
                    <td>{p.archivedAt ? <Badge status="CANCELLED">Archived</Badge> : <Badge status="ACTIVE">Active</Badge>}</td>
                    <td className="num" onClick={(e) => e.stopPropagation()}>
                      {canWrite && (p.archivedAt ? (
                        <button className="btn btn-sm btn-ghost" onClick={() => setArchived(p, false)}><ArchiveRestore size={13} /> Restore</button>
                      ) : (
                        <button className="btn btn-sm btn-ghost" onClick={() => setArchived(p, true)}><Archive size={13} /> Archive</button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {edit && (
        <Modal title={edit.id ? 'Edit item' : 'New item'} onClose={() => setEdit(null)}
          footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={!edit.name || saving}>Save</button></>}>
          <div className="form-grid">
            <Field label="Name *" className="span-2"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
            <Field label="SKU"><input className="input" value={edit.sku} onChange={(e) => setEdit({ ...edit, sku: e.target.value })} /></Field>
            <Field label="HSN / SAC (4, 6 or 8 digits)"><input className="input" value={edit.hsn} onChange={(e) => setEdit({ ...edit, hsn: e.target.value })} /></Field>
            <Field label="Unit"><input className="input" value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} /></Field>
            <Field label="Rate (₹)"><input className="input" type="number" min={0} value={edit.rate} onChange={(e) => setEdit({ ...edit, rate: Number(e.target.value) })} /></Field>
            <Field label="GST %">
              <select className="select" value={edit.gstRate} onChange={(e) => setEdit({ ...edit, gstRate: Number(e.target.value) })}>
                {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </Field>
            <Field label="Description" className="span-all"><input className="input" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          </div>
          <div className="small dim">Changing the rate or GST here affects new documents only. Saved quotations, proposals and invoices keep their own copy.</div>
        </Modal>
      )}
    </>
  );
}
