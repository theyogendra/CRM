import type { NextFunction, Request, Response } from 'express';
import { getRedis } from './redis';

const PREFIX = 'cache:';

/**
 * Read-through cache shared by every API replica. Returns fn()'s result, storing it
 * in Redis for ttlSec. Without Redis it simply calls fn().
 */
export async function cached<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  if (!redis) return fn();
  const hit = await redis.get(PREFIX + key).catch(() => null);
  if (hit) return JSON.parse(hit) as T;
  const value = await fn();
  await redis.set(PREFIX + key, JSON.stringify(value), 'EX', ttlSec).catch(() => undefined);
  return value;
}

/** Drops every cached entry. */
export async function invalidateCache() {
  const redis = getRedis();
  if (!redis) return;
  const keys = await redis.keys(`${PREFIX}*`).catch(() => [] as string[]);
  if (keys.length) await redis.del(...keys).catch(() => undefined);
}

/**
 * After any successful write (POST/PUT/PATCH/DELETE) the cache is cleared, so dashboards
 * and settings never show stale numbers. Writes are rare next to reads, so this stays cheap.
 */
export function invalidateOnWrite(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.on('finish', () => {
      if (res.statusCode < 400) void invalidateCache();
    });
  }
  next();
}
