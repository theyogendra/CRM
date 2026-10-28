# Dealstack CRM

One platform for **customers, proposals, quotations, GST tax invoices, payments, automatic WhatsApp follow-ups, sales dashboards**.

Stack: React + TypeScript + Vite · Node.js + Express + TypeScript · PostgreSQL + Prisma.
UI is a dark violet theme based on the Shakuro "Sales Analytics CRM Dashboard" Dribbble shot.

## Quick start

```bash
npm install
cp server/.env.example server/.env      # Windows: copy server\.env.example server\.env
npm run db:up                           # PostgreSQL 16 in Docker on localhost:5433
npm run db:setup                        # create tables + load demo data
npm run dev                             # API :4000  ·  web http://localhost:5173
```

Demo login (created by the seed script): `admin@dealstack.local` / `admin123`.
Running `db:setup` again **wipes everything** and reloads the demo data. Change the password and `JWT_SECRET` before real use.

Already have PostgreSQL? Skip `db:up` and point `DATABASE_URL` in `server/.env` at your own database.

Production: `npm run build && npm start` — Express serves the built React app on port 4000.

## Features

| Module | What it does |
|---|---|
| **Overview** | KPIs (sales, collected, win rate, outstanding) with period-over-period change, revenue chart (1M/3M/6M/1Y), pipeline, collections by mode, top customers, overdue list, activity feed |
| **Customers** | Leads/active/inactive, GSTIN (auto-fills the state), bill-to/ship-to, billed & outstanding totals, timeline of invoices, quotes, proposals, payments and WhatsApp messages |
| **Proposals** | Kanban by stage (Draft → Sent → Accepted/Rejected), share on WhatsApp |
| **Quotations** | GST-priced line items, accept/reject, **one-click convert to invoice** |
| **GST invoices** | Same layout as a Tally tax invoice (see `387.pdf`): consignee/buyer, delivery note, dispatch details, HSN/SAC, freight outward, **CGST+SGST (same state) or IGST (other state)** picked automatically, rounding, amount in words (Indian numbering), HSN tax summary, bank details, declaration, Original/Duplicate/Triplicate copies, Print / Save as PDF. Numbering is `PREFIX/FY/NO` (e.g. `CF/26-27/387`) |
| **Payments** | Partial/full receipts (UPI, bank, cash, cheque…); invoice status updates by itself (Unpaid → Partial → Paid / Overdue) |
| **WhatsApp** | Message log, quick send, editable templates, and **automatic follow-ups** (see below) |
| **AI Assistant** | Floating chat on every page + full-screen page. Ask things like "which invoices are overdue?", "top customers", "draft a reminder for Metro Footwear Hub", "explain IGST" |
| **Settings** | Seller details printed on documents, bank details, numbering, follow-up timings |

### Automatic WhatsApp follow-ups
A cron job (`FOLLOWUP_CRON`, default 10:00 every day) and the **Run follow-ups now** button:
- send one reminder *N* days before an invoice is due, then repeat every *N* days while it is overdue;
- nudge quotations and proposals that are still *Sent* after *N* days;
- send a thank-you whenever a payment is recorded.

Each message is sent only once per interval, so running it again does not send duplicates.

**Delivery modes**
- **Click-to-chat (default, free, no setup):** each message is saved with a `wa.me` link, and one tap opens WhatsApp with the text already filled in.
- **WhatsApp Cloud API (fully automatic):** set `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` in `server/.env` (from Meta for Developers → WhatsApp). Messages are then delivered directly.
  Note: Meta only lets you send free-form text within 24 hours of the customer's last message. Outside that window you need approved template messages.

## Backend architecture

A scalable monolith: one codebase, run as several stateless processes behind a load balancer.

```
browser ──► Nginx (web, :8080) ──┬─► api replica 1 ─┐
            static React app     └─► api replica 2 ─┼─► PostgreSQL
            per-IP request cap                       ├─► Redis: cache · rate limits · locks · job queue
                                    worker ◄─────────┘   (jobs + follow-up schedule)
```

| Concern | How it's handled | Where |
|---|---|---|
| **Stateless servers** | JWT auth, no sessions in memory, so any replica can serve any request | `src/lib/auth.ts` |
| **Load balancing** | Nginx `least_conn` across API replicas, retries a request on another replica if one is down; `X-Upstream` header shows which answered | `deploy/nginx.conf` |
| **Horizontal scaling** | `deploy.replicas` for `api` (and `worker`); Prisma `connection_limit` keeps total DB connections bounded | `docker-compose.yml` |
| **Health checks** | `/api/health` (process up, shows instance id) and `/api/ready` (DB + Redis reachable) | `src/app.ts` |
| **Event broker** | BullMQ on Redis. The API publishes jobs (e.g. `payment.recorded` → WhatsApp thank-you) and returns at once; the worker consumes them with 5 retries and exponential backoff on WhatsApp 429/5xx/network errors | `src/lib/queue.ts`, `src/services/jobs.ts`, `src/worker.ts` |
| **Scheduled jobs** | The follow-up cron lives in Redis (`upsertJobScheduler`), so it fires once no matter how many processes run; a Redis lock stops it overlapping with the "Run follow-ups now" button | `src/worker.ts`, `src/lib/redis.ts` |
| **Caching** | Dashboard overview cached in Redis for 30s and cleared after any successful write | `src/lib/cache.ts` |
| **Static files / CDN** | Nginx serves the built app; hashed `/assets/*` cached for a year, `index.html` always revalidated. Put a CDN in front of Nginx for the same effect globally | `deploy/nginx.conf` |
| **Rate limiting** | Nginx 20 req/s per IP; app-level Redis counters shared by all replicas: login 10/15 min per IP, register 5/h, API 300/min per user, AI chat 10/min per user | `src/lib/rateLimit.ts`, `src/app.ts` |
| **Graceful shutdown** | On SIGTERM the API stops accepting requests, finishes in-flight ones, then closes DB/Redis | `src/index.ts` |

Redis is optional. Without `REDIS_URL` the API behaves exactly as a single process: jobs run inline, the cron runs in-process, no cache, in-memory rate limits. That keeps `npm run dev` and the tests simple.

**Run the full stack** (Nginx + 2 API replicas + worker + Postgres + Redis): `npm run stack:up`, then `npm run db:setup` once for demo data, and open http://localhost:8080.
**Local dev with Redis:** `npm run infra:up`, set `REDIS_URL="redis://localhost:6379"` in `server/.env`, then `npm run dev:full` (API + worker + web).

## Project layout

```
server/  Express API
  prisma/schema.prisma   data model     prisma/seed.ts   demo data
  src/index.ts           API entry      src/worker.ts    background worker entry
  src/lib/               gst.ts (GST maths) · redis.ts · cache.ts · rateLimit.ts · queue.ts
  src/routes/            auth, customers, products, proposals, quotations, invoices, payments, whatsapp, dashboard, settings, ai
deploy/nginx.conf        load balancer + static file server
Dockerfile               server (API/worker) and web (Nginx) images
client/  React app (Vite)
  src/pages/             Dashboard, Customers, CustomerDetail, Proposals, Quotations, Invoices, DocumentView, Payments, Products, WhatsApp, Assistant, Settings
  src/components/        Layout, GstDocument (print layout), DocumentEditor, Chat, …
```
