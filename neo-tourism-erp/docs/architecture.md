# Architecture

## Runtime layout

```text
Browser (Next.js :3000)
        │ HTTPS/JSON + Bearer JWT
        ▼
NestJS API (:3001)
        │ Prisma adapter
        ▼
PostgreSQL

NestJS scheduled jobs ──► follow-up attention and booking lifecycle evaluation
NestJS integration adapters ──► Wise / PBX (disabled until configured)
Website ──signed webhook──► website lead intake
```

The frontend uses App Router pages and client components. `AuthProvider` owns the access token and effective permission set, `AppShell` renders permission-aware navigation, and the API client centralizes authenticated JSON requests and unauthorized-session cleanup.

The backend is modular NestJS. Controllers validate and authorize the request, services enforce ownership and state transitions, Prisma transactions protect multi-record workflows, and audit/notification services record important changes. The API never relies on hidden frontend controls for authorization.

## Cross-cutting controls

- Global DTO validation uses whitelist, unknown-field rejection, and transformation.
- JWT authentication and permission guards are applied to protected controllers.
- Financial values use PostgreSQL/Prisma Decimal rather than floating point.
- Multi-record state transitions use transactions.
- Audit values are recursively sanitized before persistence.
- Database foreign keys and unique indexes protect relationships and business identifiers.
- Pagination is used for primary customer, lead, booking, audit, notification, finance queue, employee, and asset lists. Operational self-service queues are capped at 500 pending records and should move to cursor pagination before large-scale rollout.

## Environments

Development configuration is read from local `.env` files that are excluded from version control. Production requires a managed PostgreSQL service, HTTPS reverse proxy, secret manager, centralized logs, backups, monitoring, rate limiting, and an approved deployment pipeline; these are intentionally outside this milestone.
