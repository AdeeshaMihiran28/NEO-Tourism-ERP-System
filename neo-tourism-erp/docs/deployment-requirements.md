# Deployment requirements

This document is a technical handover guide, not authorization to deploy. Production hosting and deployment remain the responsibility of the designated operations team.

## Platform

- Supported Node.js 22 LTS runtime and npm with lockfile-based installs.
- Managed PostgreSQL compatible with Prisma 7, with TLS, automated backups, point-in-time recovery, tested restores, monitoring, and a least-privilege application role.
- Separate frontend and API services behind HTTPS. Route browser traffic only to the published frontend/API origins.
- A secret manager, centralized structured logs, alerting, uptime monitoring, database monitoring, and documented incident ownership.
- Durable object storage plus malware scanning and retention controls are required before real booking/HR documents are accepted. The application currently stores document metadata/URLs only.

## Build and release commands

Use immutable source and the committed lockfiles.

```powershell
# Backend build artifact
Set-Location backend
npm.cmd ci
npx.cmd prisma generate
npm.cmd run build

# Database release (approved maintenance step)
npx.cmd prisma migrate status
npx.cmd prisma migrate deploy

# Backend runtime
npm.cmd run start:prod

# Frontend build and runtime
Set-Location ..\frontend
npm.cmd ci
npm.cmd run build
npm.cmd run start
```

Do not run `prisma migrate dev`, `prisma db push`, a development/UAT seed, or `npm audit fix --force` in production. Back up and test restore procedures before every database release. Review every migration for locking and data effects before approval.

## Network and security

- Terminate TLS using current organization-approved protocols and certificates.
- Allow CORS only from the exact frontend origin. Limit database access to the API and approved administration paths.
- Keep Swagger disabled. Apply an approved reverse-proxy security-header and rate-limit policy; login throttling is not implemented in the application yet.
- Run the API with a non-administrator operating-system/container identity and a read-only application filesystem where practical.
- Send request-ID-correlated logs to controlled storage with retention and restricted access.
- Configure production domain/DNS and certificates outside this repository, then verify both published origins and the health monitor from the hosting network.

## Schedulers and integrations

The follow-up/attention and booking-lifecycle jobs run hourly. Per-record atomic claims make repeated execution idempotent, but there is no global distributed scheduler lock. Initially run exactly one scheduler-active API worker. Add a distributed lock or queue before enabling schedulers on multiple replicas.

| Job | Frequency | Purpose and dependencies | Repeat-safety behavior |
|---|---|---|---|
| `follow-up-attention-evaluation` | Every hour | Finds callbacks due within 30 minutes, detects missed callbacks, evaluates the three-day inactivity/future-action rule, and creates notifications. Requires PostgreSQL lead, follow-up, and active-user data. | Atomic conditional updates and sent timestamps prevent repeat claims/notifications for the same record. |
| `booking-lifecycle-evaluation` | Every hour | Re-evaluates open bookings from travel, Operations, Accounts/reconciliation, and discrepancy state; derives lifecycle changes and notifications. Requires PostgreSQL booking/finance data. | State prerequisites and conditional writes make repeat execution idempotent in the supported single-scheduler topology. |

Website intake is the only implemented authenticated/idempotent integration foundation. Wise is mock/development-only, PBX is not configured, and bank, email, and SMS integrations are absent. Live provider credentials or traffic require a separate sandbox, security, retry, reconciliation, and provider acceptance exercise.

Current status: website lead intake is **READY FOR CONFIGURATION / AUTOMATED TESTED**; Wise is **MOCK / NOT CONFIGURED**; PBX is **NOT CONFIGURED**; bank, email, and SMS are **NOT IMPLEMENTED / NOT CONFIGURED**; existing CRM migration is **NOT PERFORMED**. The application must not display a provider as connected unless its adapter has actually validated the active configuration/request.

## Release and rollback

1. Record the application version, migration set, configuration checksum, approvers, backup, and restore evidence.
2. Deploy to pre-production, apply migrations once, run health/login/RBAC/main-journey smoke tests, and observe logs/metrics.
3. Promote the same artifacts only after signed acceptance.
4. Application rollback means redeploying the last approved artifact and compatible configuration. Do not automatically reverse database migrations; use a reviewed forward-fix or a tested backup restore after assessing data written since release.
5. Stop rollout on failed health checks, migration errors, unauthorized access, repeated 500 errors, data-integrity failures, or scheduler duplication.
