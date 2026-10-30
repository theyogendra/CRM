import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth } from './lib/auth';
import { invalidateOnWrite } from './lib/cache';
import { prisma } from './lib/db';
import { errorHandler } from './lib/http';
import { rateLimit } from './lib/rateLimit';
import { getRedis, instanceId } from './lib/redis';
import './services/jobs';
import auth from './routes/auth';
import customers from './routes/customers';
import dashboard from './routes/dashboard';
import invoices from './routes/invoices';
import notifications from './routes/notifications';
import payments from './routes/payments';
import products from './routes/products';
import proposals from './routes/proposals';
import quotations from './routes/quotations';
import settings from './routes/settings';
import whatsapp from './routes/whatsapp';

/** Builds the Express app without starting a listener, so tests can drive it directly. */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
  // behind Nginx: trust X-Forwarded-For so rate limits see the real client IP
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  // only the configured front end may call the API from a browser (defaults to the local dev client)
  app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') ?? ['http://localhost:5173'] }));
  app.use(express.json({ limit: '2mb' }));

  // liveness: the process is up. instance shows which replica answered.
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, instance: instanceId });
  });
  // readiness: the database and Redis answer, so the load balancer can send traffic here
  app.get('/api/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await getRedis()?.ping();
      res.json({ ok: true, instance: instanceId });
    } catch (e) {
      res.status(503).json({ ok: false, instance: instanceId, error: String(e) });
    }
  });
  app.use('/api/auth/login', rateLimit({ name: 'login', windowSec: 15 * 60, max: 10, key: (req) => req.ip ?? 'anon' }));
  app.use('/api/auth/register', rateLimit({ name: 'register', windowSec: 60 * 60, max: 5, key: (req) => req.ip ?? 'anon' }));
  app.use('/api/auth', auth);
  app.use('/api', requireAuth);
  app.use('/api', rateLimit({ name: 'api', windowSec: 60, max: Number(process.env.RATE_LIMIT_PER_MIN) || 300 }));
  app.use('/api', invalidateOnWrite);
  app.use('/api/dashboard', dashboard);
  app.use('/api/customers', customers);
  app.use('/api/products', products);
  app.use('/api/proposals', proposals);
  app.use('/api/quotations', quotations);
  app.use('/api/invoices', invoices);
  app.use('/api/payments', payments);
  app.use('/api/whatsapp', whatsapp);
  app.use('/api/settings', settings);
  app.use('/api/notifications', notifications);

  // Serve the built React app in production (npm run build && npm start)
  const web = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(web)) {
    app.use(express.static(web));
    app.get(/^\/(?!api).*/, (_req, res) => {
      res.sendFile(path.join(web, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

// Vercel loads this module as the API entry point and needs a default export\nexport default createApp();
