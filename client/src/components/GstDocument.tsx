import { fmtDate, num2 } from '../lib/format';
import type { Invoice, PrintableDoc, Quotation } from '../lib/types';

type Doc = (Invoice | Quotation) & PrintableDoc;

const pdate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-') : '';

function Party({ title, c, address }: { title: string; c: Doc['customer']; address: string }) {
  return (
    <div className="doc-cell">
      <div style={{ fontSize: 10 }}>{title}</div>
      <b>{c.name.toUpperCase()}</b>
      <div style={{ whiteSpace: 'pre-line' }}>{address}</div>
      {c.gstin && <div>GSTIN/UIN : {c.gstin}</div>}
      <div>State Name : {c.state}{c.stateCode ? `, Code : ${c.stateCode}` : ''}</div>
    </div>
  );
}

/** Printable GST tax invoice / quotation laid out like a standard Tally-style tax invoice. */
export default function GstDocument({ doc, kind, copy }: { doc: Doc; kind: 'invoice' | 'quotation'; copy: string }) {
  const co = doc.company;
  const inv = kind === 'invoice' ? (doc as Invoice & PrintableDoc) : null;
  const c = doc.customer;
  const billAddr = [c.address, [c.city, c.state, c.pincode].filter(Boolean).join(', ')].filter(Boolean).join('\n');
  const shipAddr = c.shipToSame || !c.shipAddress ? billAddr : c.shipAddress;
  const totalQty = doc.items.reduce((s, i) => s + i.quantity, 0);
  const units = [...new Set(doc.items.map((i) => i.unit))];
  const tax = doc.cgst + doc.sgst + doc.igst;
  const freightRate = doc.freightGstRate > 0 ? doc.freightGstRate : Math.max(0, ...doc.items.map((i) => i.gstRate));
  const firstHsn = doc.items[0]?.hsn ?? '';

  const meta: [string, string][] = inv
    ? [
        ['Invoice No.', inv.number], ['Dated', pdate(inv.date)],
        ['Delivery Note', inv.deliveryNote], ['Mode/Terms of Payment', inv.paymentTerms],
        ['Reference No. & Date.', ''], ['Other References', inv.quotation ? `Quotation ${inv.quotation.number}` : ''],
        ["Buyer's Order No.", inv.buyerOrderNo], ['Dated', ''],
        ['Dispatch Doc No.', inv.dispatchDocNo], ['Delivery Note Date', inv.deliveryNote ? pdate(inv.date) : ''],
        ['Dispatched through', inv.dispatchedThrough], ['Destination', inv.destination],
        ['Due Date', inv.dueDate ? pdate(inv.dueDate) : ''], ['Terms of Delivery', ''],
      ]
    : [
        ['Quotation No.', doc.number], ['Dated', pdate(doc.date)],
        ['Valid Until', pdate((doc as Quotation).validUntil)], ['Place of Supply', `${c.state} ${c.stateCode ? `(${c.stateCode})` : ''}`],
      ];

  return (
    <div className="doc-paper">
      <div className="doc-title">
        {kind === 'invoice' ? 'TAX INVOICE' : 'QUOTATION'}
        {kind === 'invoice' && <small>({copy})</small>}
      </div>

      <div className="doc-grid">
        <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid #000' }}>
          <div className="doc-cell">
            <b style={{ fontSize: 13 }}>{co.name.toUpperCase()}</b>
            <div style={{ whiteSpace: 'pre-line' }}>{co.address}</div>
            <div>{[co.city, co.state, co.pincode].filter(Boolean).join(', ').toUpperCase()}</div>
            {co.gstin && <div>GSTIN/UIN: {co.gstin}</div>}
            <div>State Name : {co.state}, Code : {co.stateCode}</div>
            {co.email && <div>E-Mail : {co.email}</div>}
          </div>
          <Party title="Consignee (Ship to)" c={c} address={shipAddr} />
          <Party title="Buyer (Bill to)" c={c} address={billAddr} />
        </div>
        <div className="doc-meta" style={{ alignContent: 'start' }}>
          {meta.map(([l, v], i) => (
            <div key={i}><label>{l}</label><b>{v}</b></div>
          ))}
        </div>
      </div>

      <table className="doc-table doc-items" style={{ borderTop: 0 }}>
        <thead>
          <tr>
            <th style={{ width: 28 }}>Sl No.</th><th>Description of Goods</th><th>HSN/SAC</th><th>Quantity</th>
            <th>Rate</th><th>per</th><th>Disc. %</th><th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((it, i) => (
            <tr key={i}>
              <td className="c">{i + 1}</td>
              <td><b>{it.description}</b></td>
              <td className="c">{it.hsn}</td>
              <td className="r"><b>{it.quantity} {it.unit}</b></td>
              <td className="r">{num2(it.rate)}</td>
              <td className="c">{it.unit}</td>
              <td className="r">{it.discount ? `${it.discount} %` : ''}</td>
              <td className="r"><b>{num2(it.amount ?? 0)}</b></td>
            </tr>
          ))}
          {doc.freight > 0 && (
            <tr>
              <td /><td style={{ textAlign: 'right' }}><b><i>FREIGHT OUTWARD {freightRate}%</i></b></td><td className="c">{firstHsn}</td>
              <td /><td /><td /><td /><td className="r">{num2(doc.freight)}</td>
            </tr>
          )}
          {doc.isInterState ? (
            <tr><td /><td style={{ textAlign: 'right' }}><b><i>IGST</i></b></td><td /><td /><td /><td /><td /><td className="r">{num2(doc.igst)}</td></tr>
          ) : (
            <>
              <tr><td /><td style={{ textAlign: 'right' }}><b><i>CGST</i></b></td><td /><td /><td /><td /><td /><td className="r">{num2(doc.cgst)}</td></tr>
              <tr><td /><td style={{ textAlign: 'right' }}><b><i>SGST</i></b></td><td /><td /><td /><td /><td /><td className="r">{num2(doc.sgst)}</td></tr>
            </>
          )}
          {doc.roundOff !== 0 && (
            <tr><td /><td style={{ textAlign: 'right' }}><i>Less : Rounding</i></td><td /><td /><td /><td /><td /><td className="r">{doc.roundOff > 0 ? '' : '(-)'}{num2(Math.abs(doc.roundOff))}</td></tr>
          )}
          <tr className="last"><td colSpan={8} style={{ height: 24 }} /></tr>
          <tr className="total">
            <td /><td style={{ textAlign: 'right' }}>Total</td><td /><td className="r">{totalQty} {units.length === 1 ? units[0] : ''}</td>
            <td /><td /><td /><td className="r">₹ {num2(doc.total)}</td>
          </tr>
        </tbody>
      </table>

      <div className="doc-box" style={{ display: 'flex' }}>
        <div style={{ flex: 1 }}>Amount Chargeable (in words)<br /><b>{doc.totalInWords}</b></div>
        <i>E. &amp; O.E</i>
      </div>

      <table className="doc-table" style={{ borderTop: 0 }}>
        <thead>
          <tr>
            <th rowSpan={2}>HSN/SAC</th><th rowSpan={2}>Taxable Value</th>
            {doc.isInterState ? <th colSpan={2}>Integrated Tax</th> : <><th colSpan={2}>Central Tax</th><th colSpan={2}>State Tax</th></>}
            <th rowSpan={2}>Total Tax Amount</th>
          </tr>
          <tr>
            {doc.isInterState ? <><th>Rate</th><th>Amount</th></> : <><th>Rate</th><th>Amount</th><th>Rate</th><th>Amount</th></>}
          </tr>
        </thead>
        <tbody>
          {doc.hsnSummary.map((h, i) => (
            <tr key={i}>
              <td>{h.hsn}</td><td className="r">{num2(h.taxable)}</td>
              {doc.isInterState ? <><td className="r">{h.rate}%</td><td className="r">{num2(h.igst)}</td></> : <>
                <td className="r">{h.rate / 2}%</td><td className="r">{num2(h.cgst)}</td><td className="r">{h.rate / 2}%</td><td className="r">{num2(h.sgst)}</td>
              </>}
              <td className="r">{num2(h.cgst + h.sgst + h.igst)}</td>
            </tr>
          ))}
          <tr>
            <td className="r"><b>Total</b></td><td className="r"><b>{num2(doc.taxable)}</b></td>
            {doc.isInterState ? <><td /><td className="r"><b>{num2(doc.igst)}</b></td></> : <>
              <td /><td className="r"><b>{num2(doc.cgst)}</b></td><td /><td className="r"><b>{num2(doc.sgst)}</b></td>
            </>}
            <td className="r"><b>{num2(tax)}</b></td>
          </tr>
        </tbody>
      </table>

      <div className="doc-box">
        Tax Amount (in words) : <b>{doc.taxInWords}</b>
        {(doc.notes || co.remarks) && (
          <div style={{ marginTop: 8 }}>Remarks:<br /><b>{doc.notes || co.remarks}</b></div>
        )}
        {co.pan && <div style={{ marginTop: 8 }}>Company&apos;s PAN : <b>{co.pan}</b></div>}
      </div>

      <div className="doc-footer">
        <div>
          <u>Declaration</u>
          <div>{co.declaration}</div>
        </div>
        <div>
          <div>Company&apos;s Bank Details</div>
          <div>A/c Holder&apos;s Name: <b>{co.bankAccountName}</b></div>
          <div>Bank Name : <b>{co.bankName}</b></div>
          <div>A/c No. : <b>{co.bankAccountNo}</b></div>
          <div>Branch &amp; IFS Code: <b>{co.bankBranchIfsc}</b></div>
          <div className="sign" style={{ borderTop: '1px solid #000', marginTop: 6, paddingTop: 4 }}>
            <b>for {co.name.toUpperCase()}</b>
            <span>Authorised Signatory</span>
          </div>
        </div>
      </div>
      <div className="doc-note">This is a Computer Generated {kind === 'invoice' ? 'Invoice' : 'Quotation'}{kind === 'quotation' ? ` · Valid until ${fmtDate((doc as Quotation).validUntil)}` : ''}</div>
    </div>
  );
}
