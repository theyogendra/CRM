import { FileText } from 'lucide-react';
import DocList from '../components/DocList';

export default function Quotations() {
  return <DocList kind="quotation" icon={<FileText size={20} />} title="Quotations" />;
}
