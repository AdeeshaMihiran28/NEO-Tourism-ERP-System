# Final departmental UAT plan

**Prepared:** 2026-09-07
**State:** READY FOR HUMAN UAT; no department has signed off.

Use the isolated UAT environment and fictional records described in `README.md`. Automated E2E coverage is engineering evidence, not business acceptance. For each row, the tester must record the actual result, evidence/request IDs, severity and approver in `uat-issue-log.md` and `uat-signoff.md`.

| Department | Scenario / starting state | Test role | Steps and expected result | Actual result | Result | Severity | Notes/evidence | Sign-off owner |
|---|---|---|---|---|---|---|---|---|
| Sales | New/existing Customer; unassigned Lead | UAT Sales 1/2 | Run S1-S4 in `sales-uat.md`; Customer → Lead → ownership/follow-up → one SaleSubmission → Admin handover, with audit/notifications and duplicate protection | Not run by staff | NOT TESTED | — | Automated CRM/Sales suites pass | Sales owner |
| Admin / Operations | Submitted UAT SaleSubmission | UAT Operations 1 | Run O1-O3 in `operations-uat.md`; accept once, retain Customer/Lead, create unique Booking/folder, add passenger/supplier/reference/document metadata/task, complete lifecycle | Not run by staff | NOT TESTED | — | Automated handover/Booking/lifecycle suites pass | Operations owner |
| Finance / Accounts | Fictional Booking in prepared finance states | UAT Accounts 1 | Run A1-A3 in `accounts-uat.md`; independently reconcile exact amounts through payments, approvals, AR/AP, banking, GL, discrepancies and reports | Not run by staff | NOT TESTED | — | Automated Accounts/Banking/GL/reporting suites pass | Finance owner |
| HR | Seeded employee, manager and HR records | UAT Employee 1, Manager, HR 1 | Run H1-H3 in `hr-uat.md`; verify privacy, attendance, leave, hierarchy, onboarding/offboarding, documents and immediate access revocation | Not run by staff | NOT TESTED | — | Automated HR suites pass | HR owner |
| Marketing | Seeded Deal, Creative, Campaign and NeoTrio records | UAT Marketing role plus approver | Run all scenarios in `../marketing/uat/marketing-uat.md`; verify controlled approval/publication, real internal metrics, Signal/Radar and provider-failure behavior | Not run by staff | NOT TESTED | — | Automated Marketing suites pass; live providers unavailable | Marketing owner |
| IT / System Admin | Seeded users, asset, ticket and access request | UAT IT 1 and Employee 1 | Run I1-I3 in `it-uat.md`, then create/deactivate a test user, review roles/integrations/audit/health, and confirm least privilege | Not run by staff | NOT TESTED | — | Automated RBAC/IT/security suites pass | IT/security owner |
| Management | Seeded cross-module dashboard data | UAT Manager | Run M1-M2 in `management-uat.md`; sample dashboard figures against source modules and review confidentiality/handovers | Not run by staff | NOT TESTED | — | Automated dashboard suite passes | Management owner |

## Acceptance rule

Every P0 stops UAT and Go-Live. Every P1 must be fixed and retested or accepted in writing by the named business, security and release owners. Blank results never count as PASS.
