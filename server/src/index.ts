import 'dotenv/config';
import { createApp } from './app';
import { assertJwtSecret } from './lib/auth';
import { prisma } from './lib/db';
import { closeQueue } from './lib/queue';
import { closeRedis, getRedis } from './lib/redis';
import { startFollowUpScheduler } from './services/followups';

assertJwtSecret(); // fail fast on an unsafe production configuration
const app = createApp();

const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
  // with Redis the worker process owns the schedule, so N API replicas don't each run it
  if (getRedis()) console.log('[followups] scheduled by the worker (REDIS_URL is set)');
  else startFollowUpScheduler();
});

// stop taking new requests, let in-flight ones finish, then close connections (rolling deploys / scale-down)
async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await closeQueue();
    await closeRedis();
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
