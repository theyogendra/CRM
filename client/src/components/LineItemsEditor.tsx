import { BookmarkPlus, Link2Off, Plus, Trash2 } from 'lucide-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api } from '../lib/api';
import { inr } from '../lib/format';
import { GST_RATES } from '../lib/gst';
import type { LineItem, Product } from '../lib/types';
import { useToast } from './ui';

export const blankItem = (): LineItem => ({ description: '', hsn: '', quantity: 1, unit: 'nos', rate: 0, discount: 0, gstRate: 18, productId: null, sku: '' });

/** Fields that come from the catalog for a linked line; rate and GST are locked. */
const isLinked = (it: LineItem) => Boolean(it.productId);

/**
 * Editable line items for quotations, invoices and proposals.
 * - Search the catalog (name, SKU, HSN) and select an item to fill the line.
 * - Catalog lines lock price and GST rate; quantity and discount stay editable.
 * - Free-form lines keep rate and GST editable; authorised users can save them to the catalog.
 * The server re-validates everything and recalculates totals; these numbers are a preview only.
 */
export default function LineItemsEditor({
  items, onChange, products, canManageCatalog, onCatalogChanged,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  products: Product[];
  canManageCatalog: boolean;
  onCatalogChanged: () => void;
}) {
  const update = (i: number, patch: Partial<LineItem>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));

  return (
    <div className="table-wrap card" style={{ background: 'var(--panel)' }}>
      <table className="table items-table">
        <thead>
          <tr>
            <th style={{ minWidth: 260 }}>Item</th><th>HSN/SAC</th><th style={{ width: 80 }}>Qty</th><th style={{ width: 80 }}>Unit</th>
            <th style={{ width: 110 }}>Rate</th><th style={{ width: 80 }}>Disc %</th><th style={{ width: 90 }}>GST %</th>
            <th className="num">Amount</th><th />
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <ItemRow key={i} index={i} item={it} products={products} canManageCatalog={canManageCatalog}
              onUpdate={(patch) => update(i, patch)} onRemove={() => remove(i)} disableRemove={items.length === 1}
              onCatalogChanged={onCatalogChanged} />
          ))}
        </tbody>
      </table>
      <div style={{ padding: 10 }}>
        <button type="button" className="btn btn-sm" onClick={() => onChange([...items, blankItem()])}>
          <Plus size={14} /> Add line
        </button>
      </div>
    </div>
  );
}

function ItemRow({ index, item, products, canManageCatalog, onUpdate, onRemove, disableRemove, onCatalogChanged }: {
  index: number; item: LineItem; products: Product[]; canManageCatalog: boolean;
  onUpdate: (patch: Partial<LineItem>) => void; onRemove: () => void; disableRemove: boolean; onCatalogChanged: () => void;
}) {
  const linked = isLinked(item);
  const amount = useMemo(() => {
    const gross = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
    return gross - (gross * (Number(item.discount) || 0)) / 100;
  }, [item.quantity, item.rate, item.discount]);

  return (
    <tr>
      <td>
        {linked ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="strong">{item.description}</span>
            {item.sku && <span className="badge">{item.sku}</span>}
            <span className="badge violet">Catalog</span>
            <button type="button" className="btn btn-ghost btn-sm" title="Detach from the catalog to edit price and GST" onClick={() => onUpdate({ productId: null, sku: '' })}>
              <Link2Off size={13} /> Unlink
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <ItemSearch products={products} onPick={(p) => onUpdate({
              productId: p.id, sku: p.sku, description: p.name, hsn: p.hsn, unit: p.unit, rate: p.rate, gstRate: p.gstRate,
            })} />
            {canManageCatalog && item.description.trim() && (
              <SaveToCatalog item={item} onSaved={(p) => { onUpdate({ productId: p.id, sku: p.sku }); onCatalogChanged(); }} />
            )}
          </div>
        )}
        {!linked && (
          <input
            className="input" style={{ marginTop: 6 }} aria-label={`Line ${index + 1} description`}
            placeholder="Or type a description" value={item.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
          />
        )}
      </td>
      <td>
        <input className="input" aria-label={`Line ${index + 1} HSN`} value={item.hsn} disabled={linked}
          onChange={(e) => onUpdate({ hsn: e.target.value })} />
      </td>
      <td>
        <input className="input" type="number" min={0} aria-label={`Line ${index + 1} quantity`} value={item.quantity}
          onChange={(e) => onUpdate({ quantity: Number(e.target.value) })} />
      </td>
      <td>
        <input className="input" aria-label={`Line ${index + 1} unit`} value={item.unit} disabled={linked}
          onChange={(e) => onUpdate({ unit: e.target.value })} />
      </td>
      <td>
        <input className="input" type="number" min={0} step="0.01" aria-label={`Line ${index + 1} rate`} value={item.rate}
          disabled={linked} title={linked ? 'Price is set in Products' : undefined}
          onChange={(e) => onUpdate({ rate: Number(e.target.value) })} />
      </td>
      <td>
        <input className="input" type="number" min={0} max={100} aria-label={`Line ${index + 1} discount`} value={item.discount}
          onChange={(e) => onUpdate({ discount: Number(e.target.value) })} />
      </td>
      <td>
        <select className="select" aria-label={`Line ${index + 1} GST rate`} value={item.gstRate} disabled={linked}
          title={linked ? 'GST rate is set in Products' : undefined}
          onChange={(e) => onUpdate({ gstRate: Number(e.target.value) })}>
          {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
        </select>
      </td>
      <td className="num">{inr(amount)}</td>
      <td>
        <button type="button" className="btn btn-ghost icon-btn btn-sm" disabled={disableRemove} onClick={onRemove} aria-label={`Remove line ${index + 1}`}>
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}

/** Searchable combobox over active catalog items. Enter/arrow keys work; Escape closes. */
function ItemSearch({ products, onPick }: { products: Product[]; onPick: (p: Product) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    const active = products.filter((p) => !p.archivedAt);
    if (!s) return active.slice(0, 8);
    return active
      .filter((p) => p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s) || p.hsn.includes(s))
      .slice(0, 8);
  }, [q, products]);

  const pick = (p: Product) => {
    onPick(p);
    setQ('');
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && matches[active]) { e.preventDefault(); pick(matches[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input
        ref={input}
        className="input"
        role="combobox"
        aria-label="Search catalog"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder="Search catalog by name, SKU or HSN"
        value={q}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={onKey}
      />
      {open && (
        <ul id={listId} role="listbox" className="card" style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, top: 'calc(100% + 4px)', maxHeight: 260, overflowY: 'auto', listStyle: 'none', margin: 0, padding: 4 }}>
          {matches.length === 0 && <li className="small dim" style={{ padding: 8 }}>No matching catalog items</li>}
          {matches.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              onMouseEnter={() => setActive(i)}
              style={{ padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: i === active ? 'var(--card-2)' : 'transparent' }}
            >
              <div className="strong small">{p.name}</div>
              <div className="small dim">{p.sku && `${p.sku} · `}HSN {p.hsn || '—'} · ₹{p.rate} · GST {p.gstRate}%</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Saves a free-form line into the catalog so it can be reused later (catalog managers only). */
function SaveToCatalog({ item, onSaved }: { item: LineItem; onSaved: (p: Product) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const p = await api.post<Product>('/products', {
        name: item.description.trim(), hsn: item.hsn ?? '', unit: item.unit || 'nos', rate: Number(item.rate) || 0,
        gstRate: Number(item.gstRate), sku: item.sku ?? '',
      });
      toast(`"${p.name}" saved to Products`);
      onSaved(p);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="btn btn-sm" onClick={save} disabled={busy} title="Save this line to Products for reuse">
      <BookmarkPlus size={13} /> Save to catalog
    </button>
  );
}
