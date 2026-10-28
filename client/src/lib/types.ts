export interface Customer {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  whatsapp: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
  shipToSame: boolean;
  shipAddress: string;
  status: 'LEAD' | 'ACTIVE' | 'INACTIVE';
  source: string;
  notes: string;
  createdAt: string;
  billed?: number;
  outstanding?: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  hsn: string;
  unit: string;
  rate: number;
  gstRate: number;
  archivedAt: string | null;
}

export interface LineItem {
  /** Catalog item this line came from. Price and GST of a catalog line are set on the server. */
  productId?: string | null;
  sku?: string;
  description: string;
  hsn: string;
  quantity: number;
  unit: string;
  rate: number;
  discount: number;
  gstRate: number;
  amount?: number;
}

export interface Company {
  name: string; address: string; city: string; state: string; stateCode: string; pincode: string; gstin: string; pan: string;
  email: string; phone: string; bankAccountName: string; bankName: string; bankAccountNo: string; bankBranchIfsc: string;
  invoicePrefix: string; nextInvoiceNo: number; quotationPrefix: string; nextQuotationNo: number;
  proposalPrefix: string; nextProposalNo: number; declaration: string; remarks: string;
  autoFollowUp: boolean; reminderDaysBefore: number; overdueEveryDays: number; quotationFollowDays: number; proposalFollowDays: number;
}

interface Totals {
  subtotal: number; taxable: number; cgst: number; sgst: number; igst: number; roundOff: number; total: number;
  freight: number; freightGstRate: number; isInterState: boolean;
}

export interface HsnLine { hsn: string; taxable: number; rate: number; cgst: number; sgst: number; igst: number }

export interface Quotation extends Totals {
  id: string; number: string; customerId: string; customer: Customer; date: string; validUntil: string | null;
  status: string; notes: string; items: LineItem[]; invoice?: { id: string; number: string } | null;
}

export interface Invoice extends Totals {
  id: string; number: string; customerId: string; customer: Customer; date: string; dueDate: string | null; status: string;
  deliveryNote: string; buyerOrderNo: string; dispatchDocNo: string; dispatchedThrough: string; destination: string;
  paymentTerms: string; notes: string; amountPaid: number; items: LineItem[]; payments?: Payment[];
  quotation?: { id: string; number: string } | null;
}

export interface PrintableDoc {
  company: Company; hsnSummary: HsnLine[]; totalInWords: string; taxInWords: string;
}

export interface Proposal {
  id: string; number: string; title: string; customerId: string; customer: { id: string; name: string };
  value: number; status: string; validUntil: string | null; content: string; createdAt: string;
}

export interface Payment {
  id: string; invoiceId: string; amount: number; date: string; mode: string; reference: string; notes: string;
  customer?: { id: string; name: string }; invoice?: { id: string; number: string; total?: number };
}

export interface Message {
  id: string; to: string; body: string; kind: string; status: string; link: string; error: string;
  automatic: boolean; createdAt: string; customer?: { id: string; name: string } | null;
}
