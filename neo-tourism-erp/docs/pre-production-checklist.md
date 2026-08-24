# Pre-production readiness checklist

**Assessment date:** 2026-08-24  
**Current decision:** **NOT READY FOR PRE-PRODUCTION TECHNICAL HANDOVER**

## Verified technical evidence

- [x] Step 21 final blocker regression found no open application P0/P1 or UAT-P0/P1 and reproduced no blocking technical failure.
- [x] Backend lint and production build pass.
- [x] Backend unit tests pass: 5 suites, 11 tests.
- [x] Backend database-backed E2E tests pass: 12 suites, 99 tests.
- [x] Frontend lint and production build pass; 27 routes generated.
- [x] Prisma format, validation, client generation, and migration status pass.
- [x] All 11 ordered migrations contain no destructive drop/truncate/delete operation found by review.
- [x] A disposable database accepted migration deployment and seeding; the production backend build started and `/health` returned HTTP 200 with `database: connected` and a request ID.
- [x] Disposable database and temporary verification helper were removed after testing.
- [x] Frontend production dependency audit reports zero vulnerabilities.
- [x] Real-secret scan of tracked project files found no committed credential; examples contain placeholders only.
- [x] Authentication, RBAC/object authorization, financial/HR access restrictions, audit sanitization, scheduler idempotency, and integration failure behavior have automated coverage.

## Required acceptance gates

- [ ] Sales UAT completed and signed.
- [ ] Admin / Operations UAT completed and signed.
- [ ] Accounts UAT completed and signed.
- [ ] HR UAT completed and signed.
- [ ] IT UAT completed and signed.
- [ ] Management UAT completed and signed.
- [ ] Product/process owner, QA lead, and security/privacy owner complete overall sign-off.
- [ ] Chrome and Edge checks pass at 1920x1080 and 1366x768, including keyboard, refresh, loading/error states, and browser console review. Both browsers are installed, but the required browser-control extension/native-host connection was absent during the 2026-08-24 assessment.
- [ ] A separate UAT/pre-production environment, reset process, role-based accounts, and named test/defect/recovery owners are provisioned.
- [ ] Organization owner approves the role/permission matrix and production token lifetime.

## Hosting and security gates

- [ ] Operations confirms HTTPS, exact-origin CORS, managed secrets, least-privilege database access, backups/PITR, and successful restore test.
- [ ] Production domain/DNS and a valid SSL certificate are configured and verified by the hosting team.
- [ ] Central logs, monitoring, alert routes, incident contacts, and retention are configured.
- [ ] Swagger is disabled and reverse-proxy security headers plus login/API rate limits are approved and tested.
- [ ] One scheduler-active worker is selected, or a distributed scheduler lock/queue is implemented and tested.
- [ ] Document/object storage, malware scanning, retention, and access controls are implemented before real documents are accepted.
- [ ] Backend Prisma toolchain advisory `QA-202` is risk-accepted or resolved without an incompatible forced downgrade.
- [ ] Live integrations remain disabled until their separate provider/security acceptance is signed.
- [ ] CRM migration remains blocked until source access, mapping, dry runs, reconciliation, rollback, and business sign-off exist.
- [x] Development seed and guarded UAT seed behavior are documented; production use of either is prohibited.
- [x] Scheduler names, frequency, dependencies, idempotency behavior, and multi-instance constraint are documented.
- [x] Integration status, known issues, environment variables, migration command, and CRM migration status are documented.

Passing automated engineering checks does not replace UAT, security acceptance, or authorization to deploy.
