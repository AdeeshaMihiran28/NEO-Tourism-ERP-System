# Phase 03 — Lead Management & Marketing Medium

## A. Existing Functionality Reused

- Existing `Customer`, `Lead`, ownership, status, activity and audit models.
- Existing customer search and duplicate detection, including explicit duplicate confirmation.
- Existing `Lead.source` field and historical values for Marketing Medium.
- Existing RBAC guards, audit logging, Pending Lead (`NEW` and unassigned) workflow, customer form and Sales navigation patterns.

## B. Changes Implemented

- Added a distinct inquiry received timestamp and requested travel end date.
- Added a Create Lead flow that selects an existing customer or creates one after duplicate checking.
- Kept existing customer contact details read-only in lead creation.
- Added backend authorization that prevents users without `customer.primary_contact.edit` from changing primary email or phone.
- Added Lead Management display/search/filter/pagination for received time, customer contact, destination, travel dates, Marketing Medium, status and owner.
- Updated lead detail create/edit/display paths and website-created leads to persist the new fields.
- Preserved `NEW`/unassigned defaults and all existing Lead Source history.

## C. Changed Files

- `backend/prisma/schema.prisma` — nullable `Lead.receivedAt`, nullable `Lead.travelEndDate`, and source/received index.
- `backend/prisma/migrations/20261118090000_phase_03_lead_received_dates/migration.sql` — additive migration only.
- `backend/prisma/seed.ts` — adds the dedicated primary-contact edit permission to seeded permissions; only roles explicitly receiving all permissions gain it.
- `backend/src/customers/customers.controller.ts` — passes authenticated permissions to customer update.
- `backend/src/customers/customers.service.ts` — enforces primary email/phone authorization.
- `backend/src/customers/customers.service.spec.ts` — primary-contact authorization tests.
- `backend/src/leads/dto/create-lead.dto.ts` — validates received time and travel end date.
- `backend/src/leads/dto/update-lead.dto.ts` — validates Marketing Medium and travel end date updates.
- `backend/src/leads/leads.service.ts` — persists, validates, filters and audits the Phase 03 lead data.
- `backend/src/leads/leads.service.spec.ts` — persistence and travel-range tests.
- `backend/src/integrations/website/website-leads.service.ts` — records receipt time for website leads.
- `frontend/src/types/lead.ts` — exposes the new lead fields.
- `frontend/src/app/leads/new/page.tsx` — existing/new customer Lead creation flow.
- `frontend/src/app/leads/page.tsx` — Lead Management list and filters.
- `frontend/src/app/leads/[id]/page.tsx` — displays/edits Marketing Medium and requested dates and shows received versus created metadata.
- `frontend/src/app/sales/page.tsx` — links the two Phase 03 screens.
- `frontend/src/components/customer-form.tsx` — supports protected, read-only primary contact inputs.
- `frontend/src/components/customer-profile.tsx` — reuses the lead creation fields for a selected customer.

## D. Database Changes

- Additive nullable `Lead.receivedAt TIMESTAMP(3)`.
- Additive nullable `Lead.travelEndDate DATE`.
- Additive index on `(source, receivedAt)`.
- No records, migrations or historical Lead Source values are removed or rewritten.
- Migration was reviewed but was not applied to any database.

## E. API Changes

- `POST /leads` additionally accepts `receivedAt` and `travelEndDate`; existing callers remain compatible.
- `PATCH /leads/:id` additionally accepts `source` and `travelEndDate`.
- Existing lead list endpoints continue to accept `source`; lead search also accepts an exact UUID.
- `PATCH /customers/:id` rejects primary email/phone changes unless the authenticated user has `customer.primary_contact.edit`.
- No new API endpoint was required.

## F. Frontend Changes

- Create Lead supports customer search/selection, duplicate-aware new-customer creation, received time, destination, date range, Marketing Medium and notes.
- Lead Management shows and filters Phase 03 information using the existing ERP styling and pagination.
- Lead detail distinguishes received time from creation time and shows the creator.
- The excluded Take Lead, My Pipeline and full status workflows were not redesigned.

## G. Testing Results

- PASS — `npx prisma validate`.
- PASS — `npx prisma generate`.
- PASS — backend unit tests: 9 suites, 22 tests.
- PASS — backend focused ESLint on all Phase 03 backend files.
- PASS — backend production build.
- PASS — frontend ESLint.
- PASS — frontend production build and TypeScript checking.
- FAIL — repository-wide backend ESLint has 97 pre-existing findings in unrelated accounting, marketing, HR/E2E and bootstrap files; Phase 03 files pass focused lint.
- NOT TESTED — database-backed E2E scenarios because no verified isolated test database was provided and running them could mutate the current database.
- NOT TESTED — browser/manual scenarios; instructions follow below.

## H. Remaining Issues

- Apply the additive migration and run the seed only in the intended development/test environment before browser testing.
- Potential Marketing Medium values are intentionally suggestions, not a closed enum; existing and future configured strings remain valid.
- Existing rows keep `receivedAt` and `travelEndDate` null because those historical facts cannot be reconstructed safely; UI falls back to `createdAt` for display.
- The worktree already contained unrelated uncommitted changes; they were preserved.

## I. Manual Testing Instructions

1. Point `DATABASE_URL` to an isolated development/test database.
2. From `neo-tourism-erp/backend`, run `npx prisma migrate dev` and `npx prisma db seed`.
3. Start the backend with `npm run start:dev` and frontend with `npm run dev`.
4. Sign in as an authorized Sales/Admin user and open **Sales CRM → Create Lead**.
5. Search and select an existing customer; confirm contact details are displayed and cannot be edited there.
6. Create two leads for that same customer and confirm both use the same customer profile.
7. Create a new customer, exercise the duplicate warning, then create a lead.
8. Enter a non-standard historical Marketing Medium and confirm it saves and appears in **Lead Management**.
9. Confirm received time differs from created time when entered differently, and confirm the creator is displayed.
10. Try an end date before the start date and confirm the backend rejects it.
11. As a normal Sales user with `customer.edit` but without `customer.primary_contact.edit`, try changing a primary email/phone through the customer API/profile and confirm HTTP 403; confirm other allowed customer fields still update.
12. Confirm a new lead appears as `NEW` and unassigned, then verify search, Marketing Medium/status filters, pagination and lead navigation.
13. Confirm an older lead with a historical Source value still opens and displays that value.

## J. Phase Completion Status

PHASE 03 COMPLETE — READY FOR USER TESTING
