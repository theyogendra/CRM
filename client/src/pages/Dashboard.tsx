import { ArrowDownRight, ArrowUpRight, LayoutGrid, MessageCircle, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Loading, PageHead, useToast } from '../components/ui';
import { api } from '../lib/api';
import { compact, fmtDate, inr, shortInr, timeAgo } from '../lib/format';
import { useApi } from '../lib/hooks';

interface Kpi { value: number; change: number }
interface DashboardData {
  kpis: {
    sales: Kpi; collected: Kpi; avgInvoice: Kpi;
    winRate: { value: number; won: number; decided: number };
    outstanding: { value: number; overdueCount: number; overdueValue: number };
    customers: { total: number; active: number; leads: number; newInRange: number };
    messages: number;
  };
  series: { month: string; invoiced: number; collected: number }[];
  pipeline: { stage: string; count: number; value: number }[];
  topCustomers: { id: string; name: string; total: number; count: number }[];
  paymentModes: { mode: string; amount: number }[];
  overdue: { id: string; number: string; customer: string; balance: number; dueDate: string }[];
  activities: { id: string; type: string; text: string; createdAt: string; customer?: { name: string } | null }[];
}

const RANGES = ['1M', '3M', '6M', '1Y'];

function Delta({ v }: { v: number }) {
  const up = v >= 0;
  return (
    <span className={`delta ${up ? 'up' : 'down'}`}>
      {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      {Math.abs(v).toFixed(1)}%
    </span>
  );
}

function KpiCard({ label, range, amount, text, fill, delta }: {
  label: string; range: string; amount?: number; text?: string; fill: number; delta?: number;
}) {
  const c = amount !== undefined ? compact(amount) : null;
  return (
    <div className="card kpi">
      <div className="kpi-top"><span>{label}</span><span>{range}</span></div>
      <div className="kpi-bar"><div style={{ width: `${Math.max(4, Math.min(100, fill))}%` }} /></div>
      <div className="kpi-row">
        <div className="kpi-value">
          {c ? <>{c.value}<span className="suffix">{c.suffix}</span></> : text}
        </div>
        {delta !== undefined && <Delta v={delta} />}
      </div>
    </div>
  );
}

const tooltipStyle = {
  background: '#1a1727', border: '1px solid #2f2a48', borderRadius: 10, color: '#eeebf7', fontSize: 12,
};

export default function Dashboard() {
  const [range, setRange] = useState('6M');
  const { data, loading, reload } = useApi<DashboardData>(`/dashboard?range=${range}`);
  const toast = useToast();
  const nav = useNavigate();
  const [running, setRunning] = useState(false);

  const runFollowUps = async () => {
    setRunning(true);
    try {
      const r = await api.post<{ dueSoon: number; overdue: number; quotations: number; proposals: number }>('/whatsapp/run-followups');
      const n = r.dueSoon + r.overdue + r.quotations + r.proposals;
      toast(n ? `Queued ${n} WhatsApp follow-ups — see the WhatsApp page` : 'Everything is up to date — no follow-ups due');
      void reload();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setRunning(false);
    }
  };

  if (!data) return loading ? <Loading /> : null;
  const k = data.kpis;
  const rangeLabel = range === '1Y' ? 'Last year' : `Last ${range.replace('M', '')} mo`;
  const maxPipe = Math.max(1, ...data.pipeline.map((p) => p.value));
  const maxTop = Math.max(1, ...data.topCustomers.map((p) => p.total));
  const totalModes = data.paymentModes.reduce((s, m) => s + m.amount, 0) || 1;

  return (
    <>
      <PageHead
        icon={<LayoutGrid size={20} />}
        title="Sales Overview"
        sub={<>
          <Badge status="ACTIVE">{k.customers.active} active</Badge>
          <Badge status="LEAD">{k.customers.leads} leads</Badge>
          <Badge status="OVERDUE">{k.outstanding.overdueCount} overdue</Badge>
        </>}
        actions={<>
          <button className="btn" onClick={runFollowUps} disabled={running}>
            <RefreshCw size={15} className={running ? 'spin' : ''} /> Run follow-ups
          </button>
          <button className="btn btn-primary" onClick={() => nav('/invoices?new=1')}><Plus size={15} /> New invoice</button>
        </>}
      />

      <div className="grid kpis">
        <KpiCard label="Total sales" range={rangeLabel} amount={k.sales.value} delta={k.sales.change}
          fill={(k.collected.value / Math.max(1, k.sales.value)) * 100} />
        <KpiCard label="Collected" range={rangeLabel} amount={k.collected.value} delta={k.collected.change}
          fill={(k.collected.value / Math.max(1, k.sales.value)) * 100} />
        <KpiCard label="Win rate" range="Quotations" text={`${k.winRate.value.toFixed(0)}%`} fill={k.winRate.value} />
        <KpiCard label="Outstanding" range={`${k.outstanding.overdueCount} overdue`} amount={k.outstanding.value}
          fill={(k.outstanding.overdueValue / Math.max(1, k.outstanding.value)) * 100} />
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Revenue dynamics</h2>
          <div className="tabs" style={{ marginLeft: 12 }}>
            {RANGES.map((r) => (
              <button key={r} className={`tab ${r === range ? 'active' : ''}`} onClick={() => setRange(r)}>{r}</button>
            ))}
          </div>
          <span className="muted small" style={{ display: 'flex', gap: 14 }}>
            <span><span className="dot" style={{ display: 'inline-block', marginRight: 6 }} />Invoiced</span>
            <span><span className="dot" style={{ display: 'inline-block', marginRight: 6, background: '#34d399', boxShadow: 'none' }} />Collected</span>
          </span>
        </div>
        <div style={{ height: 320, padding: '12px 10px 6px 0' }}>
          <ResponsiveContainer>
            <AreaChart data={data.series} margin={{ left: 10, right: 20, top: 10 }}>
              <defs>
                <linearGradient id="gInv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gCol" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#24203a" vertical={false} />
              <XAxis dataKey="month" stroke="#5e5878" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis stroke="#5e5878" tickLine={false} axisLine={false} fontSize={12} tickFormatter={shortInr} width={70} orientation="right" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => inr(v, 0)} cursor={{ stroke: '#8b5cf6', strokeDasharray: '4 4' }} />
              <Area type="monotone" dataKey="invoiced" name="Invoiced" stroke="#a78bfa" strokeWidth={2} fill="url(#gInv)" />
              <Area type="monotone" dataKey="collected" name="Collected" stroke="#34d399" strokeWidth={1.5} fill="url(#gCol)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-head"><h2 className="card-title">Sales pipeline</h2><span className="muted small">value · count</span></div>
          <div className="list" style={{ padding: '10px 0' }}>
            {data.pipeline.map((p) => (
              <div className="list-item" key={p.stage} style={{ borderTop: 0 }}>
                <span style={{ width: 130 }} className="muted">{p.stage}</span>
                <div className="mini-bar"><div style={{ width: `${(p.value / maxPipe) * 100}%` }} /></div>
                <span className="num" style={{ width: 110 }}>{shortInr(p.value)}</span>
                <span className="badge violet" style={{ width: 40, justifyContent: 'center' }}>{p.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2 className="card-title">Collections by mode</h2></div>
          <div className="list" style={{ padding: '10px 0' }}>
            {data.paymentModes.length === 0 && <div className="empty">No payments in range</div>}
            {data.paymentModes.sort((a, b) => b.amount - a.amount).map((m) => (
              <div className="list-item" key={m.mode} style={{ borderTop: 0 }}>
                <span style={{ width: 110 }} className="muted">{m.mode.replace('_', ' ')}</span>
                <div className="mini-bar"><div style={{ width: `${(m.amount / totalModes) * 100}%` }} /></div>
                <span className="num" style={{ width: 80 }}>{shortInr(m.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid cols-even" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <div className="card">
          <div className="card-head"><h2 className="card-title">Top customers</h2><span className="muted small">{rangeLabel}</span></div>
          <div className="list" style={{ paddingTop: 8 }}>
            {data.topCustomers.map((c) => (
              <Link to={`/customers/${c.id}`} className="list-item" key={c.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  <div className="mini-bar" style={{ marginTop: 6 }}><div style={{ width: `${(c.total / maxTop) * 100}%` }} /></div>
                </div>
                <span className="num">{shortInr(c.total)}</span>
              </Link>
            ))}
            {data.topCustomers.length === 0 && <div className="empty">No sales in range</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Overdue payments</h2>
            <Link to="/invoices?status=OVERDUE" className="muted small">View all</Link>
          </div>
          <div className="list" style={{ paddingTop: 8 }}>
            {data.overdue.map((o) => (
              <Link to={`/invoices/${o.id}`} className="list-item" key={o.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>{o.customer}</div>
                  <div className="small dim">{o.number} · due {fmtDate(o.dueDate)}</div>
                </div>
                <span className="num down">{inr(o.balance, 0)}</span>
              </Link>
            ))}
            {data.overdue.length === 0 && <div className="empty">No overdue invoices 🎉</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Recent activity</h2>
            <span className="muted small"><MessageCircle size={12} /> {k.messages} msgs</span>
          </div>
          <div className="list" style={{ paddingTop: 8 }}>
            {data.activities.slice(0, 7).map((a) => (
              <div className="list-item" key={a.id}>
                <span className="dot" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="small">{a.text}</div>
                  <div className="small dim">{a.customer?.name ?? ''} · {timeAgo(a.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
