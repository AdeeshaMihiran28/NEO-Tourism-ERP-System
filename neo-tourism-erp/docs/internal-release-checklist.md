# Internal release checklist

**Target:** Controlled internal user testing only  
**Current engineering decision:** READY  
**Production use:** Not approved

## Completed engineering gates

- [x] Backend lint passes.
- [x] Backend production build passes.
- [x] Backend unit tests pass: 11/11.
- [x] Backend database-backed E2E tests pass: 99/99.
- [x] Frontend lint passes.
- [x] Frontend production build passes and generates 27 routes.
- [x] Prisma schema validates.
- [x] All 11 migrations are applied to the QA database.
- [x] Development seed is repeatable.
- [x] Health, login, authenticated dashboard, unauthenticated 401 and CORS smoke tests pass.
- [x] Frontend login route returns 200 and the custom unknown route returns 404.
- [x] Frontend dependency audit reports zero vulnerabilities.
- [x] Backend Prisma dependency advisory is documented and has not been force-downgraded.
- [x] No open P0 or P1 defect is known.

## Must complete before inviting internal testers

- [ ] Use a resettable, backed-up QA database containing no production personal data.
- [ ] Configure distinct test users for Sales, Operations, Accounts, HR, IT and Management; never share the administrator password.
- [ ] Review the default role matrix with a Neo Tourism owner and remove permissions that are not required.
- [ ] Confirm backend is on 3001 and frontend is on 3000 with only one process per port.
- [ ] Confirm provider integrations show disabled/not configured and use no live credentials.
- [ ] Assign an internal test owner, defect owner, security contact and database recovery contact.
- [ ] Give testers the known-issues register and the exact test-data reset procedure.

## Manual browser matrix

- [ ] Run in an extension-free current Chrome profile at desktop width.
- [ ] Run in an extension-free current Edge profile at desktop width.
- [ ] Check navigation and forms at approximately 390 px and 768 px widths.
- [ ] Verify login, logout, expired-token redirect and browser refresh on protected routes.
- [ ] Verify direct URLs do not reveal unauthorized screens or data for every role.
- [ ] Verify loading, empty, validation, 401, 403, 404 and backend-unavailable states.
- [ ] Verify keyboard focus, labels, dialog focus/close behavior and readable contrast.
- [ ] Verify dangerous actions request confirmation and submit buttons cannot be double-clicked.
- [ ] Confirm the browser console has no application hydration or unhandled-promise errors in an extension-free profile.

## Main workflow acceptance

- [ ] Sales receives or creates a lead and atomically claims it.
- [ ] Another Sales user cannot claim or edit the owned lead.
- [ ] Sales records a follow-up; callback and attention behavior matches the documented rules.
- [ ] Sale Made creates one Payment Card and duplicate creation is rejected.
- [ ] Submitted Sales data is locked and appears in the Operations queue.
- [ ] Operations accepts once and creates one uniquely numbered booking folder.
- [ ] Operations completes passenger, supplier, reference, task and travel-date work.
- [ ] Accounts records/verifies payments, approves adjustments and resolves discrepancies.
- [ ] Reconciliation cannot complete early or with an open discrepancy.
- [ ] Lifecycle closes only after travel, Operations and Accounts prerequisites are complete.
- [ ] Closing and reasoned reopening are visible in audit records and notifications.

## Department acceptance

- [ ] Customer 360: duplicate warning, profile edits, notes and linked history.
- [ ] HR: employee, attendance, shift and leave role/ownership behavior.
- [ ] IT: asset assignment/return, own-ticket access and access-request approvals.
- [ ] Audit: authorized visibility and redacted sensitive values.
- [ ] Dashboards: counts match direct module queries for each role.
- [ ] Website webhook: missing secret rejected and duplicate external reference is idempotent.

## Stop-release conditions

Stop internal testing and mark the build **NOT READY** if any P0/P1 issue is found, including unauthorized cross-user data access, exposed password/passport/secret data, duplicate booking/payment creation, incorrect reconciliation/closure, corrupted migrations, failed builds, or a reproducible main-journey 500 error.

## Sign-off

- Engineering: ____________________ Date: __________
- Product/process owner: __________ Date: __________
- Security/privacy owner: _________ Date: __________
- QA lead: ________________________ Date: __________
