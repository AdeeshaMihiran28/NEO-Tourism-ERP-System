# Phase 04 — Pending Leads, Take Lead & My Pipeline

## A. Existing Functionality Reused

- Existing `Lead.assignedUserId`, `assignedAt`, status enum, activities, audit logs and notifications.
- Existing `lead.view`, `lead.assign`, `lead.view_all` and `lead.reassign` permission boundaries.
- Existing transactional `updateMany` claim strategy and owner-based lead access checks.
- Existing Pending Leads, My Pipeline, Lead Management and Attention Leads pages.
- Existing follow-up ownership and Sales dashboard queries.

## B. New Functionality Implemented

- Pending Leads now displays the Phase 04 lead reference, received time, customer contact, destination, travel range, Marketing Medium, status and Take Lead action.
- Pending Leads now supports search, destination/medium filtering and pagination.
- Take Lead moves the lead from `NEW` to the existing `FOLLOW_UP` status and immediately removes it from the local queue.
- My Pipeline now displays only the authenticated user's active assigned leads with contact, medium, travel range, owner, activity and next follow-up information.
- Authorized management can reassign owned leads from Lead Management using eligible Sales Advisors returned by the backend.

## C. Updated Lead Ownership Workflow

1. New leads remain `NEW` and unassigned.
2. The shared Pending Leads endpoint returns only `NEW` leads with no owner.
3. Take Lead uses the authenticated user from the JWT, not a frontend user ID.
4. A successful atomic claim sets `assignedUserId`, `assignedAt`, `FOLLOW_UP` and `lastMeaningfulActivityAt` together.
5. Activity, audit and notification records are created in the same transaction.
6. My Pipeline defaults to active statuses and always scopes results to the authenticated user.
7. Authorized reassignment changes the owner and assignment timestamp while preserving status, customer, activity and follow-up history.

## D. Concurrent Claim Protection

The existing database-safe conditional update was retained:

```text
UPDATE Lead
WHERE id = requested lead
  AND status = NEW
  AND assignedUserId IS NULL
```

Only a result count of one succeeds. A losing concurrent request receives HTTP 409, creates no assignment activity/audit/notification and cannot overwrite the winner. The frontend refreshes Pending Leads after this conflict.

## E. Changed Files

- `backend/src/leads/leads.controller.ts` — eligible-assignee endpoint and existing authenticated claim/reassign routing.
- `backend/src/leads/leads.service.ts` — FOLLOW_UP claim result, active owner-scoped pipeline, received-time sorting, eligible Sales assignees and general authorized reassignment.
- `backend/src/leads/leads.service.spec.ts` — atomic claim, conflict and reassignment security tests.
- `backend/src/dashboard/services/sales-dashboard.service.ts` — keeps the shared Pending count unassigned rather than owner-scoped.
- `backend/test/leads.e2e-spec.ts` — concurrent claim and ownership expectations updated for FOLLOW_UP, including another-owner detail denial.
- `frontend/src/app/leads/live/page.tsx` — complete Pending Leads table, filters, counts, pagination and stale-claim refresh.
- `frontend/src/app/leads/pipeline/page.tsx` — complete owner-scoped pipeline cards, filtering, counts and pagination.
- `frontend/src/app/leads/page.tsx` — authorized reassignment UI using eligible Sales Advisors.
- `frontend/src/app/leads/attention/page.tsx` — reuses the restricted eligible-assignee endpoint.
- `frontend/src/app/sales/page.tsx` and `frontend/src/components/sales-dashboard.tsx` — use the Pending Leads business label and shared count.
- `frontend/src/types/lead.ts` — displays `FOLLOW_UP` as “FOLLOWING UP”.
- `docs/phase-04-pending-leads-pipeline-report.md` — this implementation report.

## F. Database Changes

No schema change or migration was required. Existing lead ownership fields, timestamps, enums and audit records are reused.

## G. API Changes

- Existing `POST /leads/:id/claim` retains its request shape and now returns a claimed lead in `FOLLOW_UP`.
- Existing `GET /leads/live` supports the existing search, source, destination and pagination query parameters in the Pending Leads UI.
- Existing `GET /leads/my` now defaults to active pipeline statuses while preserving explicit status filtering.
- Added `GET /leads/assignees`, restricted by `lead.reassign`, returning only active Sales users with lead access.
- Existing `POST /leads/:id/reassign` now supports any owned lead for authorized callers and validates the target as an eligible Sales user.

## H. Frontend Changes

- Pending Leads was completed without changing the ERP design system.
- Claim success updates the queue/count immediately; claim conflicts show a clear message and refresh stale data.
- My Pipeline links back to Pending Leads and shows only the signed-in advisor's active leads.
- Reassignment refreshes Lead Management immediately after success.
- Existing dashboard APIs already derive Pending and Pipeline counts from the same endpoints, so no new dashboard architecture was introduced.

## I. Authorization and Security Improvements

- Claim identity comes only from the authenticated user context.
- Atomic conditions prevent claiming an assigned or non-pending lead.
- Normal agents remain unable to query all team leads, view another owner's lead detail or call reassignment without permission.
- Reassignment targets are restricted to active Sales-department users with lead access.
- Management permissions and existing audit boundaries are preserved.

## J. Testing Results

- PASS — focused backend ESLint for all Phase 04 backend and E2E files.
- PASS — backend unit tests: 9 suites, 25 tests.
- PASS — backend production build.
- PASS — frontend ESLint.
- PASS — frontend production build and TypeScript checking.
- NOT TESTED — database-backed E2E test execution, because no verified isolated test database was provided.
- NOT TESTED — browser testing with two live Sales accounts.

## K. Remaining Issues and Assumptions

- `FOLLOW_UP` is the existing enum representing the requested “Following Up” business state; no new status was added.
- An eligible reassignment target is assumed to be an active user in the Sales department with `lead.view` access.
- Existing database-backed E2E coverage requires `SEED_ADMIN_PASSWORD` and an isolated database and performs test-data writes/cleanup.
- Existing unrelated uncommitted worktree changes were preserved.

## L. Manual Testing Instructions

1. Use an isolated development/test database and start backend/frontend normally.
2. Sign in as Sales Agent A and create a lead; verify it is `NEW`, unassigned and visible under **Sales CRM → Pending Leads**.
3. Confirm the Pending row displays reference, received time, customer contact, destination, travel dates, Marketing Medium and status.
4. Use search, destination/medium filters and pagination.
5. Click **Take Lead** as Agent A; confirm success, removal from Pending Leads and appearance under **My Pipeline** as `FOLLOWING UP`.
6. Confirm Agent A is the owner, assignment time/activity/audit exist, and the lead appears in Agent A's pipeline count.
7. Sign in as Agent B; confirm the lead is absent from Agent B's My Pipeline and opening its URL returns forbidden.
8. With both agents on the same pending lead, click **Take Lead** nearly simultaneously; confirm one succeeds and one receives the already-taken message after refresh.
9. Sign in as a Manager with `lead.reassign`, open **Lead Management**, choose **Reassign**, select an eligible Sales Advisor and enter a reason.
10. Confirm the status, customer, activities and follow-ups remain unchanged while the owner, assignment timestamp, audit and notification update.
11. Confirm a normal Sales Agent cannot access the reassignment action/API and an inactive or non-Sales user cannot be selected or assigned.
12. Confirm Phase 03 lead creation and Marketing Medium display/filtering still work.

## M. Phase Completion Status

PHASE 04 COMPLETE — READY FOR USER TESTING
