# ERP 2.0 cutover, deployment and recovery runbook

**Prepared:** 2026-09-07
**Current decision:** NO-GO. This is an executable checklist, not deployment authorization.

## Entry gates

Do not schedule cutover until departmental UAT is signed, P0 is zero, P1 risks are accepted or closed, the security gate is approved, legacy mappings and staging rehearsals reconcile, Finance and HR approve their totals, private document storage is ready, and a restore drill has passed.

Record release commit/artifact, all 24 committed migrations, configuration checksum, source snapshot/checksum, mapping version, row/financial reconciliation, backup IDs, previous known-good artifact, owners and approvals.

## Production topology and configuration

Use separate frontend and API services behind HTTPS, a separate managed PostgreSQL database, private object storage, secret management, central logs/alerts and one scheduler-active backend instance. Production must never reuse development, test or UAT credentials/data. Configure the variables listed in `environment-production.md`; keep test seeds and mock providers disabled.

The intended `erp.neotourism.com` hostname did not resolve on 2026-09-07. Operations must configure DNS/TLS and verify the frontend/API routing and exact HTTPS CORS origins externally.

## Migration rehearsal and cutover

1. Obtain the approved read-only legacy source package described in `migration/crm-access-required.md`.
2. Profile it, approve field/status/user/duplicate mappings, implement only the source-specific idempotent loader, and produce masked rejection output.
3. Run dry-run validation without target writes. Record source, valid, invalid, duplicate, skipped, transformed and warning counts.
4. Import into an isolated staging database with integrations/schedulers disabled. Re-run to prove idempotency.
5. Reconcile counts, foreign keys and samples. Finance must prove source and ERP totals match by currency for AR, AP, advances, bank, outstanding Bookings and opening GL/Trial Balance. HR must approve employee/status/department/manager/user/leave counts and privacy.
6. Rehearse restore and rollback. Obtain business, data, Finance, HR, security and release approvals.
7. At cutover, back up the legacy source, production database, object store and recoverable configuration. Make the legacy system read-only and record the final export boundary. If read-only is impossible, stop unless an approved delta/catch-up ledger exists.
8. Deploy the approved backend artifact, run `npx prisma migrate status`, then `npx prisma migrate deploy`; never use reset, development migration or `db push`.
9. Run the approved loader once, reconcile again, deploy the identical approved frontend artifact, and keep access limited to the rollout group.

## Production smoke test

Run with designated reversible test records and capture request/audit IDs:

- Health and database connectivity return healthy without internal details.
- Admin and normal users can log in; disabled user and old token are rejected.
- Sales can create/search a test Customer and create/claim a Lead without duplicates.
- Operations can accept one controlled SaleSubmission into one Booking while retaining Customer/Lead IDs and a unique folder number.
- Finance pages/APIs load and reject unauthorized roles; do not create irreversible journal/payment history merely for smoke testing.
- Employee self-service works while unrelated HR data remains denied.
- Marketing routes load; providers report their truthful configured/not-configured state.
- Website test webhook accepts the approved request once and deduplicates its event ID.
- The expected audit record and notification appear.

Any failed authentication, authorization, migration, integrity, Finance, Booking, health or repeated-500 check stops rollout.

## Controlled rollout

Release in order: IT/Admin → small Sales pilot → Operations → Finance → HR → Marketing → Management/all staff. Observe each group before adding the next. Keep the legacy system read-only until reconciliation and the agreed stabilization window complete.

## Rollback

Rollback triggers are company-wide login failure, unauthorized disclosure, corruption, unexplained Finance difference, broken Booking creation, failed migration/integrity validation, sustained critical errors, or scheduler duplication. Cosmetic defects do not trigger rollback.

1. Stop new rollout and application writes; preserve logs and timestamps.
2. Disable outbound integrations/schedulers and notify the incident/release owners.
3. Redeploy the previous compatible application artifact when the database remains compatible.
4. Prefer a reviewed forward database fix. Restore the verified pre-cutover backup only with database/business approval after accounting for valid post-cutover transactions.
5. If approved, use the read-only legacy fallback plus a controlled catch-up ledger; never allow silent writes in both systems.
6. Re-run health, authentication, RBAC and critical workflow checks before reopening access.

## First 24 hours and first week

Monitor API 5xx/401/403/429 rates, latency, DB health/capacity, login failures, webhook/provider failures, scheduler jobs, Booking creation, duplicate conflicts, reconciliation/Finance discrepancies and resource use. Review hourly during rollout/day one and daily during week one. Classify tickets as BUG, TRAINING, PERMISSION, DATA, BUSINESS PROCESS or EXTERNAL PROVIDER and assign P0-P3.

## Training and support

Before access, each role must be shown login/logout and account security, its dashboard, daily workflow, approvals, prohibited actions and the support channel. Use the role guides in `uat/`: Sales Customer→Lead→Sale; Operations Sale→Booking; Accounts Payments→Verification→Reconciliation; HR Attendance→Leave→lifecycle; Marketing Deal→Creative→Approval→Schedule; IT Users→Permissions→Integrations→Health. Publish named incident, data, Finance, HR, security, support and rollback owners.
