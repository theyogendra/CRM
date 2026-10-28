import { FileSignature, MessageCircle, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import ProposalForm from '../components/ProposalForm';
import { Badge, ConfirmButton, Empty, Loading, PageHead, useToast } from '../components/ui';
import WhatsAppComposer from '../components/WhatsAppComposer';
import { api } from '../lib/api';
import { fmtDate, inr } from '../lib/format';
import { useApi } from '../lib/hooks';
import type { Proposal } from '../lib/types';

const STAGES = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'];

export default function Proposals() {
  const { data, loading, reload } = useApi<Proposal[]>('/proposals');
  const [edit, setEdit] = useState<Proposal | null | undefined>(undefined);
  const [share, setShare] = useState<Proposal | null>(null);
  const toast = useToast();

  const move = async (p: Proposal, status: string) => {
    try {
      await api.put(`/proposals/${p.id}`, { status });
      toast(`${p.number} → ${status.toLowerCase()}`);
      void reload();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <>
      <PageHead icon={<FileSignature size={20} />} title="Proposals" sub="Track proposals through each stage — sent ones get automatic WhatsApp follow-ups."
        actions={<button className="btn btn-primary" onClick={() => setEdit(null)}><Plus size={15} /> New proposal</button>} />
      {loading && !data ? <Loading /> : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', alignItems: 'start' }}>
          {STAGES.map((stage) => {
            const items = (data ?? []).filter((p) => p.status === stage);
            return (
              <div key={stage} className="card" style={{ background: 'var(--panel)' }}>
                <div className="card-head" style={{ paddingBottom: 12 }}>
                  <Badge status={stage} />
                  <span className="muted small">{items.length} · {inr(items.reduce((s, p) => s + p.value, 0), 0)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 12px 12px' }}>
                  {items.length === 0 && <Empty>Empty</Empty>}
                  {items.map((p) => (
                    <div key={p.id} className="card card-pad" style={{ padding: 14, cursor: 'pointer' }} onClick={() => setEdit(p)}>
                      <div className="small dim">{p.number}</div>
                      <div className="strong" style={{ margin: '4px 0' }}>{p.title}</div>
                      <div className="small muted">{p.customer.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', marginTop: 10, gap: 6 }}>
                        <span className="strong">{inr(p.value, 0)}</span>
                        <span className="small dim" style={{ marginLeft: 'auto' }}>till {fmtDate(p.validUntil)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-sm btn-wa" onClick={() => setShare(p)}><MessageCircle size={13} /> Share</button>
                        {stage === 'SENT' && <>
                          <button className="btn btn-sm" onClick={() => move(p, 'ACCEPTED')}>Won</button>
                          <button className="btn btn-sm" onClick={() => move(p, 'REJECTED')}>Lost</button>
                        </>}
                        <ConfirmButton onConfirm={async () => {
                          try { await api.del(`/proposals/${p.id}`); void reload(); } catch (e) { toast((e as Error).message, true); }
                        }}><Trash2 size={13} /></ConfirmButton>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {edit !== undefined && <ProposalForm p={edit} onClose={() => setEdit(undefined)} onSaved={() => { setEdit(undefined); void reload(); }} />}
      {share && <WhatsAppComposer title={`Share ${share.number}`} initial="" endpoint={`/proposals/${share.id}/send`} onClose={() => setShare(null)} onSent={reload} />}
    </>
  );
}
