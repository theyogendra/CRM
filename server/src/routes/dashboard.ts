import { Router } from 'express';
import { cached } from '../lib/cache';
import { prisma } from '../lib/db';
import { refreshStatuses } from '../services/followups';

const router = Router();

const RANGES: Record<string, number> = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 };

const pct = (cur: number, prev: number) => (prev === 0 ? (cur > 0 ? 100 : 0) : ((cur - prev) / prev) * 100);

// The overview is the heaviest read in the app, so it is cached for 30s (and cleared on any write)
router.get('/', async (req, res) => {
  const months = RANGES[String(req.query.range ?? '6M')] ?? 6;
  res.json(await cached(`dashboard:${months}`, 30, () => buildDashboard(months)));
});

async function buildDashboard(months: number) {
  await refreshStatuses();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 2 * months + 1, 1);

  const [invoices, payments, quotations, proposals, customers, activities, messages] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: { notIn: ['CANCELLED', 'DRAFT'] } },
      select: { id: true, number: true, total: true, amountPaid: true, status: true, date: true, dueDate: true,
        customerId: true, customer: { select: { name: true } } },
    }),
    prisma.payment.findMany({ where: { date: { gte: prevStart } }, select: { amount: true, date: true, mode: true } }),
    prisma.quotation.findMany({ select: { status: true, total: true, date: true } }),
    prisma.proposal.findMany({ select: { status: true, value: true } }),
    prisma.customer.findMany({ select: { status: true, createdAt: true } }),
    prisma.activity.findMany({ orderBy: { createdAt: 'desc' }, take: 12, include: { customer: { select: { name: true } } } }),
    prisma.message.count({ where: { createdAt: { gte: start } } }),
  ]);

  const inRange = (d: Date, a: Date, b: Date = now) => d >= a && d <= b;
  const sales = invoices.filter((i) => inRange(i.date, start)).reduce((s, i) => s + i.total, 0);
  const salesPrev = invoices.filter((i) => inRange(i.date, prevStart, start)).reduce((s, i) => s + i.total, 0);
  const collected = payments.filter((p) => inRange(p.date, start)).reduce((s, p) => s + p.amount, 0);
  const collectedPrev = payments.filter((p) => inRange(p.date, prevStart, start)).reduce((s, p) => s + p.amount, 0);
  const rangeInvoices = invoices.filter((i) => inRange(i.date, start));
  const avg = rangeInvoices.length ? sales / rangeInvoices.length : 0;
  const prevInv = invoices.filter((i) => inRange(i.date, prevStart, start));
  const avgPrev = prevInv.length ? salesPrev / prevInv.length : 0;
  const outstanding = invoices.filter((i) => i.status !== 'PAID').reduce((s, i) => s + i.total - i.amountPaid, 0);
  const overdue = invoices.filter((i) => i.status === 'OVERDUE');

  const decided = quotations.filter((q) => ['ACCEPTED', 'CONVERTED', 'REJECTED', 'EXPIRED'].includes(q.status));
  const won = decided.filter((q) => ['ACCEPTED', 'CONVERTED'].includes(q.status));
  const winRate = decided.length ? (won.length / decided.length) * 100 : 0;

  // monthly series (invoiced vs collected)
  const series = Array.from({ length: months }, (_, k) => {
    const m = new Date(start.getFullYear(), start.getMonth() + k, 1);
    const e = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    return {
      month: m.toLocaleString('en-IN', { month: 'short', year: '2-digit' }),
      invoiced: Math.round(invoices.filter((i) => i.date >= m && i.date < e).reduce((s, i) => s + i.total, 0)),
      collected: Math.round(payments.filter((p) => p.date >= m && p.date < e).reduce((s, p) => s + p.amount, 0)),
    };
  });

  const byCustomer = new Map<string, { name: string; total: number; count: number }>();
  rangeInvoices.forEach((i) => {
    const cur = byCustomer.get(i.customerId) ?? { name: i.customer.name, total: 0, count: 0 };
    cur.total += i.total;
    cur.count++;
    byCustomer.set(i.customerId, cur);
  });
  const topCustomers = [...byCustomer.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const count = <T extends { status: string }>(arr: T[], s: string) => arr.filter((x) => x.status === s).length;
  const sum = <T extends { status: string }>(arr: T[], s: string, f: (x: T) => number) =>
    arr.filter((x) => x.status === s).reduce((a, x) => a + f(x), 0);

  const pipeline = [
    { stage: 'Proposals sent', count: count(proposals, 'SENT'), value: sum(proposals, 'SENT', (p) => p.value) },
    { stage: 'Quotes open', count: count(quotations, 'SENT') + count(quotations, 'DRAFT'),
      value: sum(quotations, 'SENT', (q) => q.total) + sum(quotations, 'DRAFT', (q) => q.total) },
    { stage: 'Quotes won', count: won.length, value: won.reduce((s, q) => s + q.total, 0) },
    { stage: 'Unpaid invoices', count: invoices.filter((i) => i.status !== 'PAID').length, value: outstanding },
  ];

  const modes = new Map<string, number>();
  payments.filter((p) => inRange(p.date, start)).forEach((p) => modes.set(p.mode, (modes.get(p.mode) ?? 0) + p.amount));

  return {
    range: `${months}M`,
    kpis: {
      sales: { value: sales, change: pct(sales, salesPrev) },
      collected: { value: collected, change: pct(collected, collectedPrev) },
      avgInvoice: { value: avg, change: pct(avg, avgPrev) },
      winRate: { value: winRate, won: won.length, decided: decided.length },
      outstanding: { value: outstanding, overdueCount: overdue.length,
        overdueValue: overdue.reduce((s, i) => s + i.total - i.amountPaid, 0) },
      customers: { total: customers.length, active: count(customers, 'ACTIVE'), leads: count(customers, 'LEAD'),
        newInRange: customers.filter((c) => c.createdAt >= start).length },
      messages,
    },
    series,
    pipeline,
    topCustomers,
    paymentModes: [...modes.entries()].map(([mode, amount]) => ({ mode, amount })),
    overdue: overdue
      .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))
      .slice(0, 6)
      .map((i) => ({ id: i.id, number: i.number, customer: i.customer.name, balance: i.total - i.amountPaid, dueDate: i.dueDate })),
    activities,
  };
}

export default router;
