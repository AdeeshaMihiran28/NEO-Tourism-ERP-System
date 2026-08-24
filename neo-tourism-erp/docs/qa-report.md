# Post-build QA report

**Review date:** 2026-08-23  
**Release decision:** **READY for controlled internal user testing**  
**Production decision:** **NOT READY for production deployment**

## Executive summary

The application builds cleanly, the database schema is current, and all automated regression tests pass. No open P0 or P1 defect was found. The core lead-to-sale-to-booking-to-reconciliation lifecycle is covered by database-backed end-to-end tests, including concurrency, duplicate prevention, permission boundaries, record ownership, scheduler idempotency, financial calculations, audit records, and notifications.

The release is suitable for supervised internal testing with non-production data. It still has partial administration, HR, IT, document, and external-integration experiences, and interactive browser/responsive QA must be completed by the internal test team because no in-app browser was attached to this Codex session.

## Test environment

- Windows development workstation
- Next.js 16.3.1 / React 19.2.8 frontend on `http://localhost:3000`
- NestJS 11 / TypeScript backend on `http://localhost:3001`
- PostgreSQL development database on `localhost:51214`
- Prisma 7.9.1 with 11 migrations
- Node.js 22.14.0

## Quality-gate results

| Gate | Result | Evidence |
|---|---|---|
| Backend ESLint | PASS | Zero lint errors |
| Backend TypeScript/Nest build | PASS | Production build completed |
| Backend unit tests | PASS | 5 suites, 11 tests |
| Backend E2E tests | PASS | 12 suites, 99 tests |
| Frontend ESLint | PASS | Zero lint errors |
| Frontend TypeScript/Next build | PASS | 27 routes generated, including custom 404 |
| Prisma validation | PASS | Schema valid |
| Prisma migration status | PASS | 11 migrations; database up to date |
| Seed repeatability | PASS | Seed completed twice without duplicate failure |
| Frontend dependency audit | PASS | 0 vulnerabilities |
| Backend dependency audit | PARTIAL | 3 high advisories in Prisma CLI dependency chain; see known issues |
| Live API smoke | PASS | Health, login, `/auth/me`, dashboard, 401 and CORS verified |
| Live frontend HTTP smoke | PASS | Login returned 200; unknown route returned 404 |
| Interactive browser/responsive smoke | NOT RUN | No browser was attached to the test session |

## Module checklist

| Module | Status | QA conclusion |
|---|---|---|
| Auth / Users / RBAC | PARTIALLY WORKING | Authentication, inactive-user rejection, JWT validation, permission guards, user APIs, role APIs and safe responses work. A full frontend administration UI for users, departments, roles and permissions is not implemented. |
| Customer 360 | WORKING | Profiles, edits, notes, duplicate warning and related history are implemented and tested. |
| Sales CRM | WORKING | Lead creation, live queue, atomic claim, owned pipeline, status changes and notes are tested. |
| Follow-ups | WORKING | Create, update, complete/cancel, summaries, callback evaluation and repeated-run deduplication are tested. |
| Attention Leads | WORKING | Stale/missed/future-action rules, ownership filtering, manager reassignment and notification deduplication are tested. |
| Sale Made | WORKING | One sale card per lead, validation, financial snapshot and submission locking are tested. |
| Admin Handover | WORKING | Operations queue, acceptance, duplicate prevention and notifications are tested. |
| Booking Management | PARTIALLY WORKING | Concurrency-safe folder creation, passengers, suppliers, references, notes, tasks, state controls and protected closed folders work. Documents are metadata/URL records rather than uploaded files, and supplier editing is API-only. |
| Accounts | WORKING | Passenger/supplier payments, verification, approval-gated adjustments, discrepancy handling and reconciliation rules are tested with Prisma Decimal arithmetic. |
| Travel Lifecycle | WORKING | State evaluation, operations completion, reconciliation prerequisite, close/reopen audit and repeated scheduler execution are tested. |
| HR | PARTIALLY WORKING | Employee, attendance, shift, leave, document metadata and onboarding/offboarding APIs exist with ownership checks. Document and onboarding/offboarding management are not complete frontend workflows. |
| IT | PARTIALLY WORKING | Assets, assignment/return, tickets and access requests work with own-record and staff boundaries. Full ticket assignment/status/detail management is not exposed in the frontend. |
| Audit | WORKING | Sensitive-field sanitization and records for critical workflow actions are tested. |
| Notifications | WORKING | User-scoped list/read/read-all behavior and workflow/scheduler deduplication are implemented. |
| Dashboards | WORKING | Permission-controlled role dashboards use database-backed values and are covered by E2E tests. |
| Integrations | PARTIALLY WORKING | Signed/idempotent website lead intake and safe integration status work. Wise and PBX are foundations and remain not configured. |
| External CRM migration | NOT IMPLEMENTED | Awaiting the real legacy schema, data access, mapping decisions and business sign-off. |

## Security and correctness coverage

- Invalid, expired, missing and inactive-user authentication paths return 401.
- Permission guard behavior returns 403 where the caller is authenticated but unauthorized.
- Sales lead, HR employee and IT ticket ownership boundaries have negative tests.
- Password hashes, full passport values, supplier costs, integration secrets and sensitive audit fields are not exposed to unauthorized readers.
- Concurrent lead claims produce one success and one conflict; concurrent booking creation preserves unique folder numbers.
- Duplicate Sale Made and booking creation are rejected.
- Reconciliation cannot complete with unmet prerequisites or unresolved discrepancies.
- Lifecycle closure requires travel completion, Operations completion and Accounts reconciliation.
- Repeated callback, attention and lifecycle scheduler execution does not duplicate the same result.
- The finance service uses `Prisma.Decimal`; tests cover selling price, supplier cost, fees/discount adjustments, received/paid totals and expected profit.

## Defects fixed during this review

1. Added missing default role permissions required for Sales lead claiming, Management attention-lead handling, and Operations supplier-cost entry.
2. Added a seed regression test so those workflow permissions cannot silently disappear.
3. Replaced the `/users` N+1 response mapping with one nested query while retaining password-safe output.
4. Strengthened HR and IT E2E fixtures so employee self-service users cannot read another employee or ticket, or access audit records.
5. Improved frontend parsing of Nest validation arrays and generic 403 responses.
6. Closed HR/IT form double-submit windows by setting and checking the busy state before requests.
7. Prevented the Attention Leads page from requesting `/users` when the caller cannot view users.
8. Added a friendly application 404 page.

## Readiness conclusion

**READY for controlled internal user testing.** Use only test data, complete the unchecked operational/manual items in `internal-release-checklist.md`, and log findings against `known-issues.md`. This decision does not authorize production use, real customer migration, or live provider integrations.
