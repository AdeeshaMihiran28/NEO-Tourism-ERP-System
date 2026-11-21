# Phase 05 — Lead Statuses & Lead Workspace

## A. Existing Functionality Reused

- Existing `LeadStatus` enum, Lead Workspace route, owner access checks and status endpoint.
- Existing LeadActivity and AuditLog history.
- Existing notes, follow-ups, telephony, Payment Card/Sales Submission and duplicate prevention.
- Existing customer, lead, booking and Sales Submission relationships.
- Existing Pending Leads, My Pipeline, Lead Management and Attention Leads navigation.

## B. Changes Implemented

- Standardized all current business-facing labels to the seven confirmed statuses.
- Preserved ambiguous legacy enum values and records without destructive remapping.
- Restricted manual status updates to confirmed eligible statuses.
- Prevented Pending and Sale Done from being bypassed through direct status requests.
- Expanded and reorganized Lead Workspace information using existing fields and services.
- Added secondary contact, existing call logs and existing-booking passenger counts to workspace data.
- Added workspace reassignment and complete status/audit history display.
- Synchronized status labels and counts across Lead Management, Pending Leads, My Pipeline and dashboards.

## C. Final Business-Facing Lead Statuses

1. Pending
2. Following Up
3. Going to Book
4. Sale Done
5. Not Interested
6. Booked Elsewhere
7. Future Bookings

## D. Existing-to-Updated Status Mapping

| Internal value | Business-facing label | Behaviour |
| --- | --- | --- |
| `NEW` | Pending | Created unassigned; claimed through Take Lead |
| `FOLLOW_UP` | Following Up | Automatically set after Take Lead |
| `GOING_TO_BOOK` | Going to Book | Eligible for the existing sale workflow |
| `SALE_MADE` | Sale Done | Set only by submitting the existing Sales Submission |
| `NOT_INTERESTED` | Not Interested | Manual confirmed outcome |
| `BOOKED_ELSEWHERE` | Booked Elsewhere | Manual confirmed outcome |
| `TRAVEL_IN_FUTURE` | Future Bookings | Manual confirmed future outcome |
| `HANDLING` | Legacy — Handling | Preserved; no automatic mapping |
| `QUOTING` | Legacy — Quoting | Preserved; no automatic mapping |
| `CALLBACK` | Legacy — Callback | Preserved; no automatic mapping |
| `NO_RESPONSE` | Legacy — No Response | Preserved; no automatic mapping |

## E. Lead Workspace Structure and Functionality

- **Lead Overview:** reference, status, advisor, received time, Marketing Medium and customer.
- **Customer Information:** primary phone/email, secondary phone, classification and Customer Profile link.
- **Travel & Inquiry Information:** destination, date range, inquiry notes, travel requirements and existing Booking passenger count where available.
- **Activity & Communication History:** notes, status/assignment/reassignment/Sales activities and existing call logs in one newest-first timeline.
- **Follow-ups & Callbacks:** existing scheduling, status, timestamps and completion actions.
- **Sales Actions:** save information, update confirmed status, reassign, add note, call customer, start/open Payment Card and access Sales Submission.

## F. Status Transition and Authorization Behaviour

- Take Lead remains the only path from Pending to Following Up.
- Manual updates allow Following Up, Going to Book, Not Interested, Booked Elsewhere and Future Bookings.
- No strict linear transition sequence was added.
- Sale Done remains controlled by the verified draft/submit Sales Submission workflow.
- Direct updates away from Sale Done are rejected.
- Existing ownership is retained through status changes.
- Another Sales Advisor cannot update or call a restricted lead.
- Failed changes create no activity or audit entry.

## G. Changed Files

- `backend/src/leads/dto/update-lead-status.dto.ts`
- `backend/src/leads/dto/update-lead-status.dto.spec.ts`
- `backend/src/leads/leads.service.ts`
- `backend/src/leads/leads.service.spec.ts`
- `backend/src/dashboard/services/sales-dashboard.service.ts`
- `backend/src/integrations/integrations.controller.ts`
- `backend/src/integrations/telephony/telephony.service.ts`
- `backend/src/integrations/telephony/telephony.service.spec.ts`
- `backend/src/sales/sales.service.ts`
- `backend/test/leads.e2e-spec.ts`
- `frontend/src/types/lead.ts`
- `frontend/src/app/leads/[id]/page.tsx`
- `frontend/src/app/leads/live/page.tsx`
- `frontend/src/app/leads/page.tsx`
- `frontend/src/app/leads/pipeline/page.tsx`
- `frontend/src/components/sales-dashboard.tsx`
- `frontend/src/components/role-dashboard.tsx`
- `docs/phase-05-lead-status-workspace-report.md`

## H. Database Changes

No schema amendment or migration was required. Existing enum values were retained so historical data remains valid.

## I. API Changes

- Existing `PATCH /leads/:id/status` now accepts only confirmed manual status values.
- Existing `GET /leads/:id` now includes secondary phone, related call logs and existing Booking passenger count.
- Existing telephony call endpoint now enforces lead ownership/team access server-side.
- Existing Payment Card/Sales Submission endpoints and duplicate constraints remain unchanged.

## J. Frontend Changes

- Lead Workspace was reorganized into the required sections without changing routes or design architecture.
- Business labels now use Pending, Following Up, Sale Done and Future Bookings.
- Legacy records remain filterable under a clearly marked historical group.
- Quoting and other legacy statuses are no longer offered as normal business choices or KPI cards.
- Pending Leads now includes an Open Workspace link separate from Take Lead.
- My Pipeline includes Future Bookings and shows legacy columns only when historical records exist.

## K. Audit and History Improvements

- Existing LeadActivity and AuditLog status records remain the source of truth.
- Status timeline descriptions translate internal enum values into business labels.
- Existing call records are merged into the readable workspace timeline.
- Focused tests verify old/new status metadata and that failed Sale Done changes create no activity.

## L. Testing Results

- PASS — focused backend ESLint for Phase 05 backend and E2E files.
- PASS — backend unit tests: 11 suites, 39 tests.
- PASS — backend production build.
- PASS — frontend ESLint.
- PASS — frontend production build and TypeScript checking.
- NOT TESTED — database-backed E2E execution because no verified isolated test database was provided.
- NOT TESTED — interactive browser testing with multiple Sales users.

## M. Remaining Issues, Assumptions and Deferred Requirements

- `HANDLING`, `QUOTING`, `CALLBACK` and `NO_RESPONSE` are intentionally marked legacy because their mappings are ambiguous.
- Lead has no passenger-count field. Workspace displays the related Booking passenger count when one exists; otherwise it states that the count is not recorded at lead stage.
- Existing inquiry `summary` and `salesNotes` are reused as inquiry notes and travel requirements; no duplicate fields were created.
- Detailed Future Booking management, quotation improvements and advanced activity tooling remain deferred.
- Existing unrelated uncommitted worktree changes were preserved.

## N. Manual Testing Instructions

1. Start the backend and frontend against an isolated development/test database.
2. Create a lead and verify it displays as **Pending** in Pending Leads and Lead Management.
3. Open it from Pending Leads, then use Take Lead and confirm it becomes **Following Up** with the authenticated advisor.
4. Open the workspace from My Pipeline and verify Overview, Customer, Travel, History, Follow-ups and Sales Actions.
5. Confirm secondary phone, Marketing Medium, dates, notes and requirements display/save correctly.
6. Change Following Up to Going to Book, Not Interested, Booked Elsewhere and Future Bookings; verify each change persists and appears in history with user/time.
7. Send an invalid or legacy status such as `QUOTING` directly to `PATCH /leads/:id/status`; confirm HTTP 400.
8. Attempt status or telephony actions as another normal Sales Advisor; confirm access is forbidden.
9. As an authorized Manager, reassign the lead from the workspace and confirm history and ownership update without changing status.
10. From Going to Book, click **Start Sale / Payment Card**; confirm one draft is created and a repeated request is rejected as a duplicate.
11. Submit the completed Sales Submission and confirm the lead becomes **Sale Done**; verify a direct attempt to change it away from Sale Done is rejected.
12. Verify historical legacy leads remain visible/filterable and retain their original internal status.
13. Confirm Pending, My Pipeline and dashboard counts update after status changes.
14. If call logs or a Booking exist, confirm call history and Booking passenger count appear in the workspace.

## O. Phase Completion Status

PHASE 05 COMPLETE — READY FOR USER TESTING
