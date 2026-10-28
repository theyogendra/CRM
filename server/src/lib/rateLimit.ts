import type { NextFunction, Request, Response } from 'express';
import { getRedis } from './redis';

interface Options {
  /** Bucket name, e.g. "login" or "ai". */
  name: string;
  windowSec: number;
  max: number;
  /** Who is being limited; defaults to the signed-in user, else the client IP. */
  key?: (req: Request) => string;
}

const memory = new Map<string, { count: number; resetAt: number }>();

async function hit(key: string, windowSec: number): Promise<{ count: number; ttl: number }> {
  const redis = getRedis();
  if (redis) {
    // fixed window counter shared by every API replica
    const [[, count], [, ttl]] = (await redis.multi().incr(key).ttl(key).exec()) as [[null, number], [null, number]];
    if (ttl < 0) await redis.expire(key, windowSec);
    return { count, ttl: ttl < 0 ? windowSec : ttl };
  }
  const now = Date.now();
  if (memory.size > 10_000) for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
  let entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowSec * 1000 };
    memory.set(key, entry);
  }
  entry.count++;
  return { count: entry.count, ttl: Math.ceil((entry.resetAt - now) / 1000) };
}

/** Rejects requests over `max` per `windowSec` with 429. Disabled in tests. */
export function rateLimit({ name, windowSec, max, key }: Options) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'test') return next();
    const who = key ? key(req) : req.user?.id ?? req.ip ?? 'anon';
    try {
      const { count, ttl } = await hit(`rl:${name}:${who}`, windowSec);
      res.setHeader('RateLimit-Limit', String(max));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, max - count)));
      res.setHeader('RateLimit-Reset', String(ttl));
      if (count > max) {
        res.setHeader('Retry-After', String(ttl));
        res.status(429).json({ error: `Too many requests, try again in ${ttl}s` });
        return;
      }
    } catch (e) {
      // never lock users out because Redis hiccuped
      console.error('[rate-limit]', e);
    }
    next();
  };
}
