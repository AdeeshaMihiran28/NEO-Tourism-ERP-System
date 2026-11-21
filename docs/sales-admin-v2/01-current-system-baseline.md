# Current system baseline

Analysis date: 2026-11-18. Source of truth: the checked-out `test` branch and its working tree. This is a static repository analysis; no schema, migration, application, or database changes were made.

## Architecture and versions

| Layer | Verified implementation |
|---|---|
| Frontend | Next.js 16.3.4, React 19.2.8, TypeScript 5.9.3, App Router (`src/app`), Tailwind CSS 4 |
| Frontend data access | Shared `src/lib/api/client.ts`; `NEXT_PUBLIC_API_URL` with `http://localhost:3001` fallback, JSON fetch wrapper, Bearer JWT, request-ID error reporting, token removal on 401 |
| Frontend authentication | `AuthProvider`; token in local storage; `/auth/login` and `/auth/me`; permission-aware navigation and controls |
| Backend | NestJS 11.2.1, TypeScript 5.9.3, Prisma 7.9.1, PostgreSQL (`pg` 8.18.0) |
| Authentication/security | Passport JWT, bcrypt, class-validator global whitelist/forbid/transform validation, Helmet, CORS allow-list, throttling |
| Authorization | Controller-level `JwtAuthGuard` and `PermissionsGuard`; permissions are codes attached to roles |
| Audit | Persistent `AuditLog`; `AuditService` masks password, token, secret, authorization, cookie, API-key and database-URL data |
| Notifications | Persistent per-user `Notification` service with read/read-all operations; Sales, Leads, Booking and lifecycle services create notifications transactionally |
| Background work | Nest Schedule jobs for lead attention/follow-ups, booking lifecycle, HR, Meta sync, marketing deadlines/deals/calendar and NeoTrio |

`AppModule` registers Prisma, Audit, Auth, Users, Departments, Roles, Permissions, Positions, Customers, Leads, Notifications, Sales, Bookings, Accounts, HR, IT, Dashboard, Integrations and Marketing modules. The Prisma history contains 37 committed migration directories; none were changed or run during this analysis.

## Main data and workflow spine

`Customer -> Lead -> SaleSubmission -> Booking -> Booking operations / Accounts reconciliation`

- `SaleSubmission.leadId` is unique, and `SalesService.startSaleMade` also checks for an existing submission and handles a unique-constraint race.
- `Booking.leadId` and `Booking.saleSubmissionId` are unique. Booking creation requires `ADMIN_ACCEPTED` and handles duplicate creation.
- Booking creation copies `customerId`, `leadId`, sales advisor, dates, destination, price and currency; it does not duplicate the customer.
- `FolderCounter` is incremented transactionally and produces unique `NT-YYYY-NNNNNN` folder numbers; `Booking.folderNumber` is also unique.
- The handover, status changes, finance actions and lifecycle changes are audited. Notifications are created for submission, acceptance, booking creation, assignment and lifecycle events.

## Repository state caveat

The worktree already contained extensive tracked and untracked changes before this report. Results describe that current working tree, not only committed `HEAD`. Existing changes were preserved.

## Baseline conclusion

The project is buildable and the central Sales-to-Operations-to-Accounts design is materially implemented. The next stage should extend the existing aggregate and services rather than create a parallel CRM, booking or finance workflow. Runtime E2E verification remains blocked until an isolated test database is configured.
