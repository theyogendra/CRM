import { Receipt } from 'lucide-react';
import DocList from '../components/DocList';

export default function Invoices() {
  return <DocList kind="invoice" icon={<Receipt size={20} />} title="GST Invoices" />;
}
