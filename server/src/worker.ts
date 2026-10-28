import 'dotenv/config';
import { Worker } from 'bullmq';
import cron from 'node-cron';
import { prisma } from './lib/db';
import { closeQueue, getQueue, JOB_ATTEMPTS, QUEUE_NAME, runJob, type JobName, type JobPayloads } from './lib/queue';
import { closeRedis, getRedis } from './lib/redis';
import './services/jobs';

/**
 * Background worker: consumes the job queue and owns the follow-up schedule.
 * Run it as its own process (npm run worker / the "worker" compose service) so slow
 * outside calls never tie up the API, and scale it separately from the API.
 */
async function main() {
  const connection = getRedis();
  if (!connection) {
    console.error('The worker needs REDIS_URL. Without it the API runs jobs inline and needs no worker.');
    process.exit(1);
  }

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const attempts = job.opts.attempts ?? JOB_ATTEMPTS;
      return runJob(job.name as JobName, job.data as JobPayloads[JobName], {
        isFinalAttempt: job.attemptsMade + 1 >= attempts,
      });
    },
    { connection, concurrency: Number(process.env.WORKER_CONCURRENCY) || 5 },
  );
  worker.on('completed', (job) => console.log(`[worker] ${job.name} #${job.id} done`));
  worker.on('failed', (job, err) =>
    console.error(`[worker] ${job?.name} #${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`));

  // one schedule in Redis, shared by every worker replica: only one of them picks up each run
  const expr = process.env.FOLLOWUP_CRON || '0 10 * * *';
  if (cron.validate(expr)) {
    await getQueue()!.upsertJobScheduler('followups', { pattern: expr }, { name: 'followups.run', data: {} });
    console.log(`[followups] scheduled with "${expr}"`);
  } else {
    console.warn(`Invalid FOLLOWUP_CRON "${expr}", scheduler disabled`);
  }
  console.log('[worker] ready');

  const shutdown = async () => {
    await worker.close();
    await closeQueue();
    await closeRedis();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void main();
