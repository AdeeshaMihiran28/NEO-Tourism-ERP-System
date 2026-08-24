# Neo Tourism ERP internal UAT guide

## What UAT means

User Acceptance Testing (UAT) checks whether the ERP matches how Neo Tourism actually works. It is not only a search for technical errors. Testers should identify confusing steps, missing information, incorrect permissions, duplicated entry, poor handovers, and reminders that do not help their work.

This is a test environment. Use fictional UAT records only. **Never enter real customer/passenger data, card details, banking credentials, personal passwords, or live provider credentials.**

## Who should test

One or more representatives from Sales, Admin/Operations, Accounts, HR, IT, and Management should complete their department guide. A normal employee should complete the self-service parts of the HR and IT guides.

Do not use `SUPER_ADMIN` for normal scenarios.

| Test identity | Login email pattern | Purpose |
|---|---|---|
| UAT Manager | `uat.manager@<UAT_EMAIL_DOMAIN>` | Management and cross-department review |
| UAT Sales 1 | `uat.sales1@<UAT_EMAIL_DOMAIN>` | Main Sales journey |
| UAT Sales 2 | `uat.sales2@<UAT_EMAIL_DOMAIN>` | Two-agent claim test |
| UAT Operations 1 | `uat.operations1@<UAT_EMAIL_DOMAIN>` | Admin handover and booking work |
| UAT Accounts 1 | `uat.accounts1@<UAT_EMAIL_DOMAIN>` | Payments and reconciliation |
| UAT HR 1 | `uat.hr1@<UAT_EMAIL_DOMAIN>` | HR administration |
| UAT IT 1 | `uat.it1@<UAT_EMAIL_DOMAIN>` | IT operations |
| UAT Employee 1 | `uat.employee1@<UAT_EMAIL_DOMAIN>` | Employee self-service |

Get the UAT domain, URL, and password from the UAT coordinator. Do not share the administrator password. If login fails, record the page, time, account email, message, and request reference; never include the password.

## How to test

1. Sign in with the role named by the scenario.
2. Follow each step in the department guide.
3. Mark the matching row in `uat-checklist.md` as `PASS`, `PASS WITH ISSUES`, or `FAIL`.
4. Answer the business questions in plain language.
5. Record every problem in `uat-issue-log.md` using a unique `UAT-###` ID.
6. Copy `uat-feedback-template.md` when more detail is needed.
7. Sign out before changing roles. Do not reuse a previous role's browser session.

UAT data can be changed freely when a scenario asks for it. Records carrying `[UAT TEST DATA]`, `UAT-`, or the configured UAT email domain are fictional. Do not change configuration, roles, or permissions unless the scenario explicitly asks an authorized coordinator to do so.

## Reporting a problem

Include:

- UAT issue ID, tester, department, role, date and approximate time
- Scenario and page/module
- What you tried, what happened, and what you expected
- Exact steps another person can follow
- The visible `Reference: REQ-...` value when present
- Screenshot with sensitive fields hidden
- Whether retrying, refreshing, or signing in again changed the result

### Issue types

- `BUG`: agreed behavior does not work.
- `BUSINESS RULE ISSUE`: the system works technically but does not match company workflow.
- `PERMISSION ISSUE`: access is missing or too broad.
- `UX ISSUE`: the workflow is confusing or unnecessarily difficult.
- `MISSING REQUIREMENT`: required business capability is absent.
- `ENHANCEMENT`: useful but not required for the initial release.
- `BUSINESS RULE CHANGE`: a requested change to the currently agreed workflow; do not implement silently.

### Priorities

- `UAT-P0` Critical: system unusable, security/data exposure, major corruption, or the main workflow is completely blocked.
- `UAT-P1` High: a major department workflow is blocked, a financial/business result is wrong, or a major permission is wrong.
- `UAT-P2` Medium: work can continue but there is a meaningful problem or important usability gap.
- `UAT-P3` Low: visual, wording, or nice-to-have improvement.

Stop testing and notify the UAT lead immediately for P0. P1 must be fixed or explicitly accepted/deferred with a reason before release progression.

## UAT environment setup (technical owner)

Use a separate PostgreSQL database, conceptually `neo_tourism_erp_uat`. Keep these values separate from every production value:

```text
APP_ENV=uat
DATABASE_URL=<UAT database only; database name must contain _uat>
JWT_SECRET=<UAT-only random secret>
WEBSITE_WEBHOOK_SECRET=<UAT-only test secret>
UAT_USER_PASSWORD=<UAT-only password of at least 12 characters>
UAT_EMAIL_DOMAIN=<approved UAT email domain>
WISE_API_TOKEN=
PBX_API_URL=
PBX_API_TOKEN=
```

Set frontend `APP_ENV=uat` during its build/run so the yellow UAT banner appears. Keep Wise and PBX `NOT_CONFIGURED`; keep bank integrations unconfigured. A website test webhook may use the UAT secret.

After applying migrations and the normal base seed to the UAT database, run:

```bash
npm run db:seed:uat
```

The UAT seed refuses to run unless `APP_ENV=uat` and the database name contains `_uat`. It is repeatable and restores the named baseline records, but it is not a general database reset.

## Reset strategy

Never add a Reset Database button or public reset endpoint. The database owner should take a clean UAT snapshot after seeding. Between rounds, either restore that snapshot or recreate only the separate UAT database, apply migrations, run the base seed, then run the UAT seed. Confirm the database name before any restore/recreate action. Preserve the issue log outside the database.

## Browser and performance check

Run the core journey in current Google Chrome and Microsoft Edge at 1920×1080 and 1366×768. Check Pipeline, Booking Detail, Accounts, HR, IT, and Dashboard for unusable horizontal overflow. Time login, Dashboard, Live Leads, Customer search, Pipeline, Booking search/detail, and Accounts queue; report any page that repeatedly feels blocked or sends visibly repeated requests.

Known partial UI areas are listed in `../known-issues.md`. Finding that a known limitation blocks real work is still valuable UAT feedback.

## Feedback cycle

```text
Report → Triage → Fix or decision → Developer/regression test → READY_FOR_RETEST → Tester retest → CLOSED
```

Code completion alone does not close a UAT issue. Avoid scope expansion: prioritize required work, security/data correctness, major efficiency, useful improvements, then nice-to-have requests.

## Guides

- `sales-uat.md`
- `operations-uat.md`
- `accounts-uat.md`
- `hr-uat.md`
- `it-uat.md`
- `management-uat.md`
- `uat-checklist.md`
- `uat-feedback-template.md`
- `uat-issue-log.md`
- `uat-signoff.md`
