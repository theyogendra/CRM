import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { computeTotals, financialYear } from '../src/lib/gst';

const prisma = new PrismaClient();
const DAY = 86_400_000;

// deterministic pseudo-random so the demo looks the same every time
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const between = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1));

export const TEMPLATES = [
  { key: 'INVOICE_SENT', name: 'Invoice shared',
    body: 'Hi {{customer}}, thank you for your order! 🙏\nInvoice *{{number}}* for *{{amount}}* from {{company}} is ready. Payment due: {{dueDate}}.\nBank: {{bank}}' },
  { key: 'INVOICE_DUE_SOON', name: 'Payment due soon (auto)',
    body: 'Hi {{customer}}, a friendly reminder from {{company}}: invoice *{{number}}* with balance *{{amount}}* is due on {{dueDate}}. Please ignore if already paid. 🙏' },
  { key: 'INVOICE_OVERDUE', name: 'Payment overdue (auto)',
    body: 'Hi {{customer}}, invoice *{{number}}* from {{company}} for *{{amount}}* is overdue by {{days}} day(s) (due {{dueDate}}). Kindly arrange the payment at the earliest. Thank you!' },
  { key: 'QUOTATION_SENT', name: 'Quotation shared',
    body: 'Hi {{customer}}, please find our quotation *{{number}}* for *{{amount}}* from {{company}}. Valid until {{validUntil}}. Happy to answer any questions!' },
  { key: 'QUOTATION_FOLLOWUP', name: 'Quotation follow-up (auto)',
    body: 'Hi {{customer}}, just following up on quotation *{{number}}* ({{amount}}) from {{company}}. Shall we go ahead with the order? Let us know if you need any changes.' },
  { key: 'PROPOSAL_SENT', name: 'Proposal shared',
    body: 'Hi {{customer}}, sharing our proposal *{{title}}* ({{number}}) from {{company}}, estimated value {{amount}}. Looking forward to your feedback!' },
  { key: 'PROPOSAL_FOLLOWUP', name: 'Proposal follow-up (auto)',
    body: 'Hi {{customer}}, checking in on our proposal *{{title}}* ({{number}}). Do you have any questions, or would you like to schedule a quick call?' },
  { key: 'PAYMENT_THANKS', name: 'Payment received (auto)',
    body: 'Hi {{customer}}, we have received *{{amount}}* against invoice *{{number}}*. Balance: {{balance}}. Thank you for your business! — {{company}}' },
];

const CUSTOMERS = [
  { name: 'Vinnsa Shoes', contactPerson: 'Vinod Kumar', city: 'Puducherry', state: 'Puducherry', stateCode: '34', gstin: '34AAEFV3369B1ZC' },
  { name: 'Metro Footwear Hub', contactPerson: 'Rahul Mehta', city: 'Mumbai', state: 'Maharashtra', stateCode: '27', gstin: '27AABCM1234F1Z5' },
  { name: 'Lucknow Leather House', contactPerson: 'Asif Khan', city: 'Lucknow', state: 'Uttar Pradesh', stateCode: '09', gstin: '09AAKFL4521K1ZQ' },
  { name: 'StepUp Retail Pvt Ltd', contactPerson: 'Priya Sharma', city: 'Bengaluru', state: 'Karnataka', stateCode: '29', gstin: '29AAHCS7788P1ZJ' },
  { name: 'Ganga Traders', contactPerson: 'Mohit Agarwal', city: 'Kanpur', state: 'Uttar Pradesh', stateCode: '09', gstin: '09ABGFG9087M1Z2' },
  { name: 'Coastal Comfort Wear', contactPerson: 'Anitha R', city: 'Kochi', state: 'Kerala', stateCode: '32', gstin: '32AAQFC5566D1ZK' },
  { name: 'Royal Mojari Emporium', contactPerson: 'Deepak Singh', city: 'Jaipur', state: 'Rajasthan', stateCode: '08', gstin: '08AAPFR3322C1ZT' },
  { name: 'Delhi Shoe Bazaar', contactPerson: 'Sanjay Gupta', city: 'New Delhi', state: 'Delhi', stateCode: '07', gstin: '07AAFFD6612H1ZB' },
  { name: 'Sunrise Sports', contactPerson: 'Kiran Patel', city: 'Ahmedabad', state: 'Gujarat', stateCode: '24', gstin: '24AAJFS2290N1ZU' },
  { name: 'Hyderabad Walkers', contactPerson: 'Farhan Ali', city: 'Hyderabad', state: 'Telangana', stateCode: '36', gstin: '36AAEFH1180Q1ZW' },
  { name: 'Agra Craft Exports', contactPerson: 'Neha Verma', city: 'Agra', state: 'Uttar Pradesh', stateCode: '09', gstin: '' },
  { name: 'Chennai Feet First', contactPerson: 'Lakshmi N', city: 'Chennai', state: 'Tamil Nadu', stateCode: '33', gstin: '' },
];

const PRODUCTS = [
  { sku: 'POWER-02', name: 'Shoes POWER-02', hsn: '6404', unit: 'pairs', rate: 225, gstRate: 5 },
  { sku: 'OXF-LTH-01', name: 'Leather Formal Oxford', hsn: '6403', unit: 'pairs', rate: 890, gstRate: 18 },
  { sku: 'KOL-HND-01', name: 'Handmade Kolhapuri', hsn: '6405', unit: 'pairs', rate: 340, gstRate: 5 },
  { sku: 'RUN-X1', name: 'Sports Runner X1', hsn: '6404', unit: 'pairs', rate: 620, gstRate: 18 },
  { sku: 'KID-SND-01', name: 'Kids Sandals Fun', hsn: '6402', unit: 'pairs', rate: 180, gstRate: 5 },
  { sku: 'MOJ-CLS-01', name: 'Ladies Mojari Classic', hsn: '6405', unit: 'pairs', rate: 410, gstRate: 5 },
];

async function main() {
  console.log('Seeding…');
  await prisma.$transaction([
    prisma.activity.deleteMany(), prisma.message.deleteMany(), prisma.payment.deleteMany(),
    prisma.lineItem.deleteMany(), prisma.invoice.deleteMany(), prisma.quotation.deleteMany(),
    prisma.proposal.deleteMany(), prisma.customer.deleteMany(), prisma.product.deleteMany(),
    prisma.messageTemplate.deleteMany(), prisma.company.deleteMany(), prisma.user.deleteMany(),
  ]);

  await prisma.user.create({
    data: { name: 'Admin', email: 'admin@dealstack.local', role: 'ADMIN', passwordHash: await bcrypt.hash('admin123', 10) },
  });
  // demo STAFF account: can sell, but cannot change the catalog or company settings
  await prisma.user.create({
    data: { name: 'Sales Staff', email: 'staff@dealstack.local', role: 'STAFF', passwordHash: await bcrypt.hash('staff123', 10) },
  });

  const company = await prisma.company.create({
    data: {
      id: 1,
      name: 'Your Company Name',
      address: 'Head Office, Main Road',
      city: 'Agra',
      state: 'Uttar Pradesh',
      stateCode: '09',
      pincode: '282010',
      gstin: '09ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
      email: 'accounts@yourcompany.in',
      phone: '+91 90000 00000',
      bankAccountName: 'Your Company Name',
      bankName: 'Your Bank',
      bankAccountNo: '000000000000',
      bankBranchIfsc: 'BRANCH & IFSC0000000',
      invoicePrefix: 'CF',
      quotationPrefix: 'QT',
      proposalPrefix: 'PR',
      remarks: 'THESE GOODS ARE HAND MADE. NO RETURN & NO EXCHANGE.',
    },
  });

  await prisma.messageTemplate.createMany({ data: TEMPLATES });
  await prisma.product.createMany({ data: PRODUCTS });

  const customers = [];
  for (const [i, c] of CUSTOMERS.entries()) {
    const phone = `9${between(100000000, 999999999)}`;
    customers.push(
      await prisma.customer.create({
        data: {
          ...c,
          phone,
          whatsapp: phone,
          email: `${c.contactPerson.split(' ')[0].toLowerCase()}@example.com`,
          address: `${between(1, 99)}/${between(1, 20)}, Market Road`,
          pincode: String(between(110001, 699999)),
          status: i < 9 ? 'ACTIVE' : 'LEAD',
          source: pick(['Referral', 'Trade fair', 'WhatsApp', 'IndiaMART', 'Walk-in']),
          createdAt: new Date(Date.now() - between(30, 300) * DAY),
        },
      }),
    );
  }

  const now = new Date();
  let invNo = 360;
  let qtNo = 101;
  let prNo = 21;
  const fy = financialYear();

  const makeItems = () =>
    Array.from({ length: between(1, 3) }, () => {
      const p = pick(PRODUCTS);
      return { description: p.name, hsn: p.hsn, unit: p.unit, rate: p.rate, gstRate: p.gstRate,
        quantity: between(2, 16) * 10, discount: pick([0, 0, 0, 5, 10]) };
    });

  // ~8 months of invoice history
  for (let m = 7; m >= 0; m--) {
    const count = between(4, 7) + (7 - m) / 2;
    for (let k = 0; k < count; k++) {
      const cust = pick(customers.slice(0, 10));
      const date = new Date(now.getFullYear(), now.getMonth() - m, between(1, 27), 11);
      if (date > now) continue;
      const items = makeItems();
      const freight = pick([0, 0, 500, 1200, 2086]);
      const isInterState = cust.stateCode !== company.stateCode;
      const t = computeTotals(items, { freight, isInterState });
      const dueDate = new Date(date.getTime() + pick([15, 30, 45]) * DAY);
      const inv = await prisma.invoice.create({
        data: {
          number: `${company.invoicePrefix}/${fy}/${invNo}`,
          customerId: cust.id, date, dueDate, freight, isInterState,
          deliveryNote: `${invNo}/${between(1, 4)}, ${between(1, 6)} carton`,
          dispatchedThrough: pick(['SAFE EXPRESS', 'VRL Logistics', 'Delhivery', 'Gati', 'By Hand']),
          destination: cust.city.toUpperCase(),
          paymentTerms: pick(['15 days', '30 days', 'Advance', '']),
          subtotal: t.subtotal, taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: t.igst,
          roundOff: t.roundOff, total: t.total,
          items: { create: t.lines },
          createdAt: date,
        },
      });
      invNo++;

      // payments: older invoices mostly paid, recent ones partially / unpaid
      const r = rnd();
      let paid = 0;
      if (m >= 2 ? r < 0.85 : r < 0.4) paid = t.total;
      else if (r < (m >= 2 ? 0.95 : 0.65)) paid = Math.round(t.total * pick([0.3, 0.5, 0.6]));
      if (paid > 0) {
        const pdate = new Date(Math.min(now.getTime(), date.getTime() + between(3, 40) * DAY));
        await prisma.payment.create({
          data: { invoiceId: inv.id, customerId: cust.id, amount: paid, date: pdate,
            mode: pick(['UPI', 'BANK_TRANSFER', 'BANK_TRANSFER', 'CHEQUE', 'CASH']), reference: `TXN${between(100000, 999999)}` },
        });
      }
      const status = paid >= t.total ? 'PAID' : dueDate < now ? 'OVERDUE' : paid > 0 ? 'PARTIAL' : 'UNPAID';
      await prisma.invoice.update({ where: { id: inv.id }, data: { amountPaid: paid, status } });
      await prisma.activity.create({
        data: { type: 'invoice', text: `Invoice ${inv.number} raised for ₹${t.total.toLocaleString('en-IN')}`, customerId: cust.id, createdAt: date },
      });
    }
  }

  // quotations
  const qStatuses = ['SENT', 'SENT', 'DRAFT', 'ACCEPTED', 'REJECTED', 'CONVERTED', 'CONVERTED', 'EXPIRED', 'SENT', 'ACCEPTED'] as const;
  for (const status of qStatuses) {
    const cust = pick(customers);
    const date = new Date(now.getTime() - between(2, 60) * DAY);
    const t = computeTotals(makeItems(), { freight: pick([0, 800]), isInterState: cust.stateCode !== company.stateCode });
    await prisma.quotation.create({
      data: {
        number: `${company.quotationPrefix}/${fy}/${qtNo++}`, customerId: cust.id, date, status,
        validUntil: new Date(date.getTime() + 30 * DAY), freight: t.taxable - t.subtotal,
        isInterState: cust.stateCode !== company.stateCode,
        subtotal: t.subtotal, taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: t.igst, roundOff: t.roundOff, total: t.total,
        items: { create: t.lines },
      },
    });
  }

  // proposals
  const proposals = [
    ['Annual footwear supply contract 2027', 'SENT', 850000],
    ['Corporate gifting – festive collection', 'SENT', 240000],
    ['School shoes bulk order', 'ACCEPTED', 510000],
    ['Export sample range – Europe', 'DRAFT', 1200000],
    ['Retail shop-in-shop partnership', 'REJECTED', 300000],
    ['Hotel staff uniform footwear', 'SENT', 175000],
  ] as const;
  for (const [title, status, value] of proposals) {
    const cust = pick(customers);
    await prisma.proposal.create({
      data: {
        number: `${company.proposalPrefix}/${fy}/${prNo++}`, title, status, value, customerId: cust.id,
        validUntil: new Date(now.getTime() + between(10, 45) * DAY),
        content: `Scope:\n- Supply of handmade footwear as per agreed specifications\n- Delivery within 15 days of PO\n\nCommercials:\n- Prices inclusive of packing, GST extra as applicable\n- Payment: 50% advance, balance against delivery`,
        updatedAt: new Date(now.getTime() - between(1, 12) * DAY),
      },
    });
  }

  await prisma.company.update({
    where: { id: 1 },
    data: { nextInvoiceNo: invNo, nextQuotationNo: qtNo, nextProposalNo: prNo },
  });

  console.log(`Done. Admin: admin@dealstack.local / admin123 · Staff: staff@dealstack.local / staff123 (${invNo - 360} invoices)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
