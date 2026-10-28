import { Send } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import type { Message } from '../lib/types';
import { useWhatsAppResult } from '../lib/whatsapp';
import { Field, Modal, useToast } from './ui';

/** Lets the user review/edit a WhatsApp message before sending it. */
export default function WhatsAppComposer({ title, initial, endpoint, customerId, onClose, onSent }: {
  title: string; initial: string; endpoint?: string; customerId?: string; onClose: () => void; onSent?: () => void;
}) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const show = useWhatsAppResult();
  const toast = useToast();

  const send = async () => {
    setBusy(true);
    try {
      const msg = endpoint
        ? await api.post<Message>(endpoint, { message: body })
        : await api.post<Message>('/whatsapp/send', { customerId, body });
      show(msg);
      onSent?.();
      onClose();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-wa" onClick={send} disabled={busy || (!endpoint && !body.trim())}><Send size={15} /> Send on WhatsApp</button>
      </>}>
      <Field label="Message (leave empty to use the saved template)">
        <textarea className="textarea" rows={6} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="Type a message…" />
      </Field>
      {body && <div><div className="small dim" style={{ marginBottom: 6 }}>Preview</div><div className="wa-bubble">{body}</div></div>}
    </Modal>
  );
}
