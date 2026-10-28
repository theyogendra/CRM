import { Queue } from 'bullmq';
import { getRedis } from './redis';

/**
 * Event broker. The API publishes jobs here and returns right away; the worker process
 * (src/worker.ts) consumes them, retrying with backoff when WhatsApp or another
 * outside service fails. Without Redis, jobs run inline in the API process instead.
 */
export const QUEUE_NAME = 'crm-jobs';

export interface JobPayloads {
  /** A payment was recorded: send the customer a thank-you message. */
  'payment.recorded': { paymentId: string; balanceBefore: number };
  /** Run the automatic follow-up engine (also scheduled by the worker). */
  'followups.run': Record<string, never>;
}
export type JobName = keyof JobPayloads;

/** isFinalAttempt is false while the queue will still retry the job after a thrown error. */
export interface JobContext {
  isFinalAttempt: boolean;
}
type Handler<N extends JobName> = (data: JobPayloads[N], ctx: JobContext) => Promise<unknown>;
const handlers: { [N in JobName]?: Handler<N> } = {};

/** Registers the function that processes a job type, in both the worker and inline mode. */
export function handle<N extends JobName>(name: N, fn: Handler<N>) {
  (handlers as Record<string, unknown>)[name] = fn;
}

export async function runJob<N extends JobName>(name: N, data: JobPayloads[N], ctx: JobContext = { isFinalAttempt: true }) {
  const fn = handlers[name] as Handler<N> | undefined;
  if (!fn) throw new Error(`No handler for job "${name}"`);
  return fn(data, ctx);
}

export const JOB_ATTEMPTS = 5;

let queue: Queue | null | undefined;
export function getQueue(): Queue | null {
  if (queue !== undefined) return queue;
  const connection = getRedis();
  queue = connection ? new Queue(QUEUE_NAME, { connection }) : null;
  return queue;
}

/** Publishes a job. Falls back to running it inline (errors are logged, not thrown) without Redis. */
export async function publish<N extends JobName>(name: N, data: JobPayloads[N]) {
  const q = getQueue();
  if (q) {
    await q.add(name, data, {
      attempts: JOB_ATTEMPTS,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    return;
  }
  await runJob(name, data).catch((e) => console.error(`[jobs] ${name} failed`, e));
}

export async function closeQueue() {
  if (queue) await queue.close().catch(() => undefined);
  queue = undefined;
}
