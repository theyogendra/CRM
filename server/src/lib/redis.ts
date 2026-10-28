import os from 'node:os';
import Redis from 'ioredis';

/**
 * Shared Redis connection, used for caching, rate limits, locks and the job queue.
 * Redis is optional: without REDIS_URL the API runs as a single self-contained
 * process (in-process cron, no cache), which is how local dev and tests work.
 */
let client: Redis | null | undefined;

export const redisUrl = () => process.env.REDIS_URL || '';

export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = redisUrl();
  client = url ? new Redis(url, { maxRetriesPerRequest: null }) : null;
  client?.on('error', (e) => console.error('[redis]', e.message));
  return client;
}

/** Name of this process, shown in /api/health so you can see the load balancer spreading requests. */
export const instanceId = `${os.hostname()}:${process.pid}`;

/**
 * Runs fn only if no other instance holds the lock. With several API replicas and a worker,
 * this keeps a job such as the follow-up run from executing twice at the same moment.
 * Returns null when the lock is already taken.
 */
export async function withLock<T>(name: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return fn();
  const key = `lock:${name}`;
  const ok = await redis.set(key, instanceId, 'PX', ttlMs, 'NX');
  if (!ok) return null;
  try {
    return await fn();
  } finally {
    // only release the lock if it is still ours
    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1, key, instanceId,
    );
  }
}

export async function closeRedis() {
  if (client) await client.quit().catch(() => undefined);
  client = undefined;
}
