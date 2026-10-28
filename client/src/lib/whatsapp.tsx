import { useToast } from '../components/ui';
import type { Message } from './types';

/** Shows the outcome of a WhatsApp send. In link mode it opens WhatsApp with the message pre-filled. */
export function useWhatsAppResult() {
  const toast = useToast();
  return (msg: Message) => {
    if (msg.status === 'SENT') toast('✅ WhatsApp message delivered via Cloud API');
    else if (msg.status === 'LINK') {
      window.open(msg.link, '_blank', 'noopener');
      toast(<span>WhatsApp opened with message ready. <a href={msg.link} target="_blank" rel="noreferrer">Open again</a></span>);
    } else toast(`WhatsApp failed: ${msg.error || 'unknown error'}`, true);
  };
}
