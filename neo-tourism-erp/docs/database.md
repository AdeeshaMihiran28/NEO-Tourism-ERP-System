# Database

## Source of truth

The schema is `backend/prisma/schema.prisma`. Migration directories under `backend/prisma/migrations` are immutable history. Do not edit an applied migration; create a new migration.

## Local commands

Run from `backend`:

```powershell
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
npx.cmd prisma validate
npx.cmd prisma migrate status
```

The seed is idempotent for departments, roles, permissions, and configured development users. Admin/test passwords come only from environment variables.

## Main entity relationships

```text
Customer ──< Lead ──1 SaleSubmission ──1 Booking
   │                                      ├──< Passenger
   │                                      ├──< BookingSupplier >── Supplier
   │                                      ├──< BookingReference / BookingDocument
   │                                      ├──< BookingTask / BookingNote
   │                                      ├──< PassengerPayment / SupplierPayment
   │                                      └──1 Reconciliation ──< ReconciliationDiscrepancy
   └──────────────────────────────────────< Booking

User >──< Role >──< Permission
User ──> Department
User ──0..1 Employee ──< Attendance / LeaveRequest / EmployeeDocument
Employee ──< AssetAssignment >── ITAsset
Employee ──< ITTicket / AccessRequest
User ──< AuditLog / Notification
```

Audit logs retain the actor, entity, action, sanitized changes, request metadata, and timestamp. Notifications are recipient-scoped and optionally link back to a business entity. Counter tables allocate folder, employee, asset, and ticket identifiers safely.

## Integrity model

- UUID primary keys identify business records; human folder, employee, asset, and ticket numbers are separately unique.
- User email and permission code are unique.
- Folder numbers use a transactional counter and are concurrency tested.
- Attendance is unique per employee/date.
- Website integration events are idempotent by source and external reference.
- Restrictive foreign keys prevent deletion of records still referenced by operational or financial history; selected ownership links use `SetNull`, and child join/history records use deliberate cascades.
- Currency amounts are `Decimal`; all write DTOs accept validated decimal strings.

## Backup and recovery requirements

Before production, define automated encrypted backups, point-in-time recovery, restore drills, retention, restricted database roles, TLS, monitoring, capacity alerts, and a migration rollback/runbook. Never use `prisma migrate reset` against shared or production data.

Create a development migration with `npm run db:migrate -- --name descriptive_name`; apply committed production migrations with the deployment pipeline's `prisma migrate deploy`, then run `npm run db:generate` during the build. Back up and rehearse before production schema changes.
