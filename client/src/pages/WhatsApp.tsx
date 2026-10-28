import { Bot, MessageCircle, Play, Save, Send, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Empty, Field, Loading, PageHead, useToast } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { useApi } from '../lib/hooks';
import type { Customer, Message } from '../lib/types';
import { useWhatsAppResult } from '../lib/whatsapp';

interface Template { id: string; key: string; name: string; body: string }

function TemplateEditor({ t }: { t: Template }) {
  const [body, setBody] = useState(t.body);
  const toast = useToast();
  useEffect(() => setBody(t.body), [t.body]);
  return (
    <div className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="strong">{t.name}</span>
        {t.name.includes('auto') && <span className="badge violet"><Zap size={11} /> automatic</span>}
        <button className="btn btn-sm" style={{ marginLeft: 'auto' }} disabled={body === t.body}
          onClick={async () => { await api.put(`/whatsapp/templates/${t.id}`, { body }); t.body = body; toast('Template saved'); }}>
          <Save size={13} /> Save
        </button>
      </div>
      <textarea className="textarea" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
    </div>
  );
}

export default function WhatsApp() {
  const { data: messages, loading, reload } = useApi<Message[]>('/whatsapp/messages');
  const { data: templates } = useApi<Template[]>('/whatsapp/templates');
  const { data: status } = useApi<{ mode: string; schedule: string }>('/whatsapp/status');
  const { data: customers } = useApi<Customer[]>('/customers');
  const [to, setTo] = useState('');
  const [body, setBody] = useState('');
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<'all' | 'auto' | 'manual'>('all');
  const toast = useToast();
  const show = useWhatsAppResult();

  const send = async () => {
    try {
      const m = await api.post<Message>('/whatsapp/send', { customerId: to, body });
      show(m);
      setBody('');
      void reload();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const run = async () => {
    setRunning(true);
    try {
      const r = await api.post<Record<string, number>>('/whatsapp/run-followups');
      const n = Object.values(r).reduce((a, b) => a + b, 0);
      toast(n ? `Generated ${n} follow-ups (due soon ${r.dueSoon}, overdue ${r.overdue}, quotes ${r.quotations}, proposals ${r.proposals})` : 'No follow-ups due right now');
      void reload();
    } finally {
      setRunning(false);
    }
  };

  const rows = (messages ?? []).filter((m) => filter === 'all' || (filter === 'auto' ? m.automatic : !m.automatic));

  return (
    <>
      <PageHead icon={<MessageCircle size={20} />} title="WhatsApp Follow-ups"
        sub={<>
          <Badge status={status?.mode === 'cloud' ? 'ACTIVE' : 'LINK'}>{status?.mode === 'cloud' ? 'Cloud API connected' : 'Click-to-chat mode'}</Badge>
          <span className="badge">Auto-run cron: {status?.schedule}</span>
        </>}
        actions={<button className="btn btn-primary" onClick={run} disabled={running}><Play size={15} /> Run follow-ups now</button>} />

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="toolbar">
            <strong>Message log</strong>
            <div className="tabs" style={{ marginLeft: 'auto' }}>
              {(['all', 'auto', 'manual'] as const).map((f) => <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f}</button>)}
            </div>
          </div>
          {loading && !messages ? <Loading /> : rows.length === 0 ? <Empty>No messages yet. Share an invoice or run follow-ups.</Empty> : (
            <div className="list">
              {rows.map((m) => (
                <div key={m.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="small" style={{ marginBottom: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {m.customer ? <Link to={`/customers/${m.customer.id}`} className="strong">{m.customer.name}</Link> : <span>+{m.to}</span>}
                      <span className="dim">{fmtDateTime(m.createdAt)}</span>
                      <span className="dim">· {m.kind.replace(/_/g, ' ').toLowerCase()}</span>
                      {m.automatic && <span className="badge violet"><Bot size={11} /> auto</span>}
                    </div>
                    <div className="wa-bubble">{m.body}</div>
                    {m.error && <div className="small down" style={{ marginTop: 4 }}>{m.error}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <Badge status={m.status}>{m.status === 'LINK' ? 'ready' : m.status}</Badge>
                    {m.status !== 'SENT' && m.link && <a className="btn btn-sm btn-wa" href={m.link} target="_blank" rel="noreferrer"><Send size={12} /> Send</a>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <strong>Quick message</strong>
            <Field label="Customer">
              <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Select customer…</option>
                {customers?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.whatsapp || c.phone || 'no number'})</option>)}
              </select>
            </Field>
            <Field label="Message"><textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} /></Field>
            <button className="btn btn-wa" onClick={send} disabled={!to || !body.trim()}><Send size={15} /> Send</button>
          </div>

          <div className="card card-pad small muted" style={{ lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text)' }}>How automatic follow-ups work</strong>
            <ul style={{ paddingLeft: 18, margin: '8px 0 0' }}>
              <li>Invoices due within N days get one reminder; overdue ones are re-reminded every N days.</li>
              <li>Quotations & proposals in <b>Sent</b> get nudged if there&apos;s no reply.</li>
              <li>A thank-you goes out when a payment is recorded.</li>
              <li>Timings are in <Link to="/settings" style={{ color: 'var(--accent-2)' }}>Settings</Link>. Add WhatsApp Cloud API keys in <code>server/.env</code> to deliver automatically; otherwise each message is ready to send in one tap.</li>
            </ul>
          </div>

          <div className="card">
            <div className="card-head" style={{ paddingBottom: 6 }}><h3 className="card-title">Templates</h3>
              <span className="muted small">{'{{customer}} {{number}} {{amount}} {{dueDate}} {{company}}'}</span></div>
            <div className="list">{templates?.map((t) => <TemplateEditor key={t.id} t={t} />)}</div>
          </div>
        </div>
      </div>
    </>
  );
}
