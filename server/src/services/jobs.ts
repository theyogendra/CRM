import { getCompany, prisma } from '../lib/db';
import { handle } from '../lib/queue';
import { withLock } from '../lib/redis';
import { inr, runFollowUps } from './followups';
import { renderTemplate, sendWhatsApp } from './whatsapp';

/** Job handlers. Imported by both the API (inline mode) and the worker process. */

handle('payment.recorded', async ({ paymentId, balanceBefore }, { isFinalAttempt }) => {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { invoice: { include: { customer: true } } },
  });
  if (!payment) return; // deleted before the job ran
  const inv = payment.invoice;
  const company = await getCompany();
  const body = await renderTemplate('PAYMENT_THANKS', {
    customer: inv.customer.contactPerson || inv.customer.name,
    company: company.name,
    number: inv.number,
    amount: inr(payment.amount),
    balance: inr(Math.max(0, balanceBefore - payment.amount)),
  });
  await sendWhatsApp({ to: inv.customer.whatsapp || inv.customer.phone, body, customerId: inv.customerId,
    kind: 'PAYMENT_THANKS', relatedType: 'invoice', relatedId: inv.id, automatic: true,
    throwIfTemporary: !isFinalAttempt });
});

handle('followups.run', async () => {
  // the lock stops two runs (cron + "Run follow-ups now", or two workers) sending the same reminder twice
  const summary = await withLock('followups', 10 * 60_000, () => runFollowUps());
  console.log('[followups]', summary ?? 'skipped, another run is in progress');
  return summary;
});
