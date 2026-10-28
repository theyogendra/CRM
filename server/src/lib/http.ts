import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  return schema.parse(data);
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: err.flatten() });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const code = (err as { code?: string })?.code;
  if (code === 'P2025') {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (code === 'P2002') {
    res.status(409).json({ error: 'Duplicate value' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}

/** Parses an optional date string from forms ("" -> null). */
export const toDate = (v?: string | null) => (v ? new Date(v) : null);
