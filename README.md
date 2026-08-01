# FixItNow 🔧 — Backend API

> **Your Trusted Home Service Platform** — REST API for a home services marketplace.

![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.21-000000?logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6.16-2D3748?logo=prisma&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

Customers browse services and technicians, book an available time slot, pay through **Stripe** or **SSLCommerz**, track the job to completion, and leave a review. Technicians manage their profile, services, and availability, and work incoming bookings through to completion. Admins moderate the whole platform.

Companion frontend: [`fixitnow-frontend`](../FixItNow-frontend) (Next.js) — this API is frontend-agnostic and fully documented via OpenAPI + Postman below.

**Live API**: https://fixitnow-backend-bw9e.onrender.com

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [API reference](#api-reference)
- [Demo accounts](#demo-accounts)
- [Booking status flow](#booking-status-flow)
- [Project structure](#project-structure)
- [Scripts](#scripts)
- [Deployment](#deployment)
- [Known limitations](#known-limitations)

## Features

**Customer** — register/login, browse services & technicians with filters, book a specific available slot, pay by Stripe or SSLCommerz, track and cancel bookings, leave a review after completion.

**Technician** — manage profile (bio, experience, location, photo) and services, set availability slots, accept/decline/start/complete incoming bookings.

**Admin** — platform-wide stats (users, bookings, revenue), ban/unban users, manage categories.

Also: JWT auth, Zod-validated input, rate limiting, centralized error handling, Stripe & SSLCommerz webhook/callback handling, OpenAPI docs, and a self-chaining Postman collection.

## Tech stack

| | |
|---|---|
| Runtime | Node.js ≥20, TypeScript 5.7 |
| Framework | Express 4 |
| Database | PostgreSQL + Prisma 6 |
| Auth | JWT (bearer) + bcrypt |
| Validation | Zod |
| Payments | Stripe, SSLCommerz |
| Uploads | Multer (technician profile photos) |
| Security | Helmet, CORS, express-rate-limit |
| Docs | OpenAPI + Swagger UI, Postman collection |

## Getting started

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL, JWT_SECRET, etc.
docker compose up -d          # optional: local Postgres matching .env.example
npm run prisma:migrate        # create tables
npm run seed                  # wipe + seed demo data
npm run dev                   # http://localhost:4000
```

- Health check: `GET /health`
- Interactive docs: `GET /api-docs` (Swagger UI)
- Postman: import [`postman/FixItNow.postman_collection.json`](postman/FixItNow.postman_collection.json) — a single ordered, self-chaining flow. Set the `baseUrl` variable and hit **Run** on the whole collection.
  - Folder `07` needs real Stripe/SSLCommerz keys on the server to pass.
  - Folder `10` demonstrates the full paid → completed → reviewed lifecycle using seed data, so it only passes once per fresh `npm run seed`.
  - Folder `12` is reference-only (gateway callbacks) — deselect it before running.

## Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | Server port (default `4000`) |
| `NODE_ENV` | `development` / `production` |
| `BASE_URL` | This server's own public URL — used to build the payment gateways' redirect/webhook callback links |
| `FRONTEND_URL` | Where a customer's browser lands after a payment gateway redirect |
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | Auth token signing |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin account created by `prisma/seed.ts` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe integration |
| `SSLCOMMERZ_STORE_ID` / `SSLCOMMERZ_STORE_PASSWORD` / `SSLCOMMERZ_IS_LIVE` | SSLCommerz integration |

See [`.env.example`](.env.example) for a ready-to-copy template.

## API reference

Base path `/api`. Every response is `{ success, message, data, meta? }` on success, or `{ success: false, message, errorDetails }` on error (`errorDetails` is a `{field, message}[]` list for validation failures).

| Module | What it covers |
|---|---|
| **Auth** | Register, login, `me` |
| **Categories** | Public list; admin create/update/delete |
| **Services** | Public list/filter/detail; technician-owned create/update/delete |
| **Technicians** | Public list/filter/detail; self profile, photo upload, and availability |
| **Bookings** | Create (slot-aware), customer/technician-scoped lists, cancel, status transitions (accept/decline/start/complete) |
| **Payments** | Create checkout session, confirm, Stripe & SSLCommerz callbacks/webhooks, scoped history |
| **Reviews** | Create (customer, post-completion only, one per booking) |
| **Admin** | Platform stats, user list + ban/unban, platform-wide bookings, categories |

Full request/response schemas: `GET /api-docs`.

## Demo accounts

Seeded by `prisma/seed.ts` (or reset any time with `npm run seed`):

| Role | Email | Password |
|---|---|---|
| Admin | `admin@fixitnow.com` (or your `ADMIN_EMAIL`) | `Admin123!` (or your `ADMIN_PASSWORD`) |
| Technician | `bob.tech@fixitnow.com` / `erin.tech@fixitnow.com` / `frank.tech@fixitnow.com` | `password123` |
| Customer | `carol@fixitnow.com` / `dave@fixitnow.com` / `emma@fixitnow.com` | `password123` |

Also seeds 3 categories, services, availability slots, and bookings spanning every status (including a paid-and-reviewed one), so every endpoint has real data right away.

## Booking status flow

```
REQUESTED --accept--> ACCEPTED --pay--> PAID --start--> IN_PROGRESS --complete--> COMPLETED
REQUESTED --decline--> DECLINED
REQUESTED/ACCEPTED/PAID --cancel--> CANCELLED   (only before IN_PROGRESS)
```

## Project structure

```
src/
├── modules/        # auth, categories, services, technicians, bookings, payments, reviews, admin
├── middlewares/     # auth, roles, validation, rate limiting, uploads, error handling
├── config/          # env, Prisma client
├── routes/          # route aggregation
├── docs/             # openapi.yaml
└── utils/
prisma/
├── schema.prisma
└── seed.ts
postman/
└── FixItNow.postman_collection.json
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Typecheck and compile to `dist/` |
| `npm start` | Run the compiled build |
| `npm run prisma:migrate` | Create/update tables in development |
| `npm run prisma:deploy` | Apply migrations in production |
| `npm run seed` | Wipe and reseed demo data |

## Deployment

Standard long-running Express server (not serverless) — deploys cleanly to **Render**:

- Build: `npm install && npm run build` · Start: `npm start`
- Add the env vars from `.env.example`, pointing `DATABASE_URL` at a reachable Postgres (e.g. [Neon](https://neon.tech))
- Set `BASE_URL` to the deployed URL (used to build payment redirect/webhook links) and `FRONTEND_URL` to wherever the frontend is actually deployed
- Run `npm run prisma:deploy` + `npm run seed` against the production database once, after first deploy

## Known limitations

- Single currency per provider (Stripe in USD, SSLCommerz in BDT) — no per-service currency field yet.
- JWT access tokens only, no refresh flow.
- Booking creation accepts a freeform date as a fallback when no availability slot is chosen, which skips slot-conflict checking — deliberate, not a bug.
- `sslcommerz-lts` pulls in a `form-data` version with an unpatched advisory (no fix available upstream); our usage only passes fixed field names through it, not user-controlled ones.

---

MIT licensed.
