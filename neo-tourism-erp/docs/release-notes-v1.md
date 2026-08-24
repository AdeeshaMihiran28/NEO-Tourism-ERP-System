# Neo Tourism ERP 2.0 - internal release candidate notes

**Release class:** Internal UAT candidate  
**Assessment date:** 2026-08-24  
**Deployment status:** Not approved for pre-production or production

## Included foundation

- JWT authentication, users, departments, roles, permissions, and protected navigation/API access.
- Customer 360, duplicate warnings, notes, and linked customer activity.
- Live/new leads, ownership, sales pipeline, follow-ups, callbacks, attention rules, and hourly evaluation.
- Sale Made, payment-card creation, Operations handover, booking folders, passengers, suppliers, references, tasks, and travel dates.
- Payments, adjustments, discrepancies, reconciliation, lifecycle closure/reopening controls, and audit history.
- HR employee/attendance/shift/leave foundations and IT assets/tickets/access-request foundations.
- Audit logging, notifications, role-aware management dashboards, website webhook intake, and provider preparation adapters.

## Principal journey

A Sales user receives or creates and claims a lead, records follow-up activity, and submits Sale Made. The system creates one payment card and an Operations handover. Operations accepts it once and builds a uniquely numbered booking folder. Accounts records and verifies financial activity and resolves reconciliation discrepancies. Lifecycle automation closes a completed booking only after travel, Operations, and Accounts prerequisites are satisfied; reasoned reopening is audited.

## Security controls

JWT authentication, permission-based route/API enforcement, object-level ownership checks, finance/HR field restrictions, validation, audit redaction, idempotency/uniqueness constraints, exact-origin CORS configuration, and production Swagger disabling are included. Production throttling, MFA/SSO, secret management, infrastructure headers, and a penetration test remain separate readiness work.

## Quality evidence

Backend lint/build, 11 unit tests, 99 database E2E tests, frontend lint/build, Prisma validation/generation/migration status, and isolated database/runtime smoke testing pass. UAT has not started and no department has signed acceptance.

## Known limits

- Administration, HR, IT, supplier editing, browser automation, pagination, timezone handling, document storage, and production operational controls have the open items listed in `known-issues.md`.
- Live Wise/PBX/bank/email/SMS connections are not included. Website webhook intake still requires environment configuration and external acceptance.
- No real CRM migration has been performed.
- Production hosting, CI/CD, secret management, monitoring, restore procedures, rate limiting, MFA/SSO, malware scanning, and incident operations are outside this build.

See `pre-production-checklist.md` and `final-handover-summary.md` for the release gate.

## Recommended next steps

Provision isolated UAT, complete all six department scripts and browser checks, triage/retest real feedback, obtain sign-off, close or accept the documented operational risks, and then repeat the pre-production assessment. Keep live providers and CRM migration as separately approved workstreams.
