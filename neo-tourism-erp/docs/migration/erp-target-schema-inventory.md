# ERP target schema inventory

## Basis and scope

Generated from the actual `backend/prisma/schema.prisma` and all 20 migration directories present on 2026-08-26. It does not rely on the older planning document. PostgreSQL is the target engine; Prisma uses UUID primary keys for the listed business models and `Decimal(12,2)` for listed money fields. `String` fields have no Prisma length cap unless the schema explicitly specifies one.

“Required” below lists material fields without `?`; generated IDs/timestamps and defaulted fields are noted where useful. Any migration must also satisfy all target foreign keys and application invariants. This inventory describes the target only and is not a legacy mapping.

## Identity, organization, and audit

| Model | Purpose | Primary key / unique fields | Required fields | Relationships | Relevant enums | Sensitive fields | Migration notes |
|---|---|---|---|---|---|---|---|
| `User` | ERP login and business actor | `id`; unique `email` | `email`, `passwordHash`, `firstName`, `lastName`; `isActive` defaults true | optional Department; many roles and actor/owner relations | none | password hash, email, identity | Never import legacy passwords. Map by verified email/stable approved ID. Former actors need a non-login historical representation or inactive user decision. |
| `Department` | Organizational unit | `id`; unique `name` | `name`; `isActive` defaults true | Users, Employees | none | low | Normalize only after business confirmation; do not infer departments from free text. |
| `Role` | RBAC role | `id`; unique `name` | `name` | UserRole, RolePermission | none | authorization metadata | Legacy job titles are not automatically ERP roles. |
| `Permission` | Atomic authorization grant | `id`; unique `code` | `code` | RolePermission | none | authorization metadata | Do not derive permissions from legacy access without security approval. |
| `Employee` | HR employee profile | `id`; unique `userId`, `employeeNumber` | name, employee number, job title, department, employment type/status, join date | optional User; Department; manager hierarchy; HR/IT records | `EmploymentType`, `EmploymentStatus`, `ProcessStatus` | DOB, home/contact/emergency details, employment data | CRM agent records may map to User, Employee, both, or historical actor only; business/security decision required. |
| `AuditLog` | Native ERP audit event | `id` | `actorId`, `entityType`, UUID `entityId`, `action` | required User actor | none | old/new JSON, IP, user agent | Current model has no explicit legacy-source field and requires a current User plus UUID entity ID. Do not make the migration user appear to be the historical actor. Recommend a reviewed legacy-audit design before import. |

## Customer and sales CRM

| Model | Purpose | Primary key / unique fields | Required fields | Relationships | Relevant enums | Sensitive fields | Migration notes |
|---|---|---|---|---|---|---|---|
| `Customer` | Customer 360 root | `id`; no business unique constraint | `firstName`, `lastName`, `createdById`, `updatedById`; type/activity defaulted | creator/updater Users; notes, leads, sales, bookings, calls, marketing | `CustomerType` = `NEW`, `REPEAT`, `REFERRAL` | name, email, phones, DOB, nationality | Email/phone are indexed but not unique. Deduplication needs a separately approved policy; preserve every legacy ID. Actor FKs must be mapped. |
| `CustomerNote` | Chronological customer note | `id` | `customerId`, `content`, `createdById` | Customer, creator User | none | free-text PII | Preserve chronology/actor where trustworthy; scan samples only in masked/restricted output. |
| `Lead` | Sales enquiry/pipeline record | `id`; no business unique constraint | `customerId`, `createdById`; status/attention defaulted | Customer; optional assignee; creator; activities, follow-ups, sale, booking, calls, marketing | `LeadStatus`; `AttentionReason` | travel intent, notes, destination, behavior timestamps | Do not map status by spelling. Derive `lastMeaningfulActivityAt` and `nextActionAt` only from reliable history; suppress normal attention automation during import. |
| `LeadActivity` | Immutable-style lead timeline event | `id` | `leadId`, `userId`, `type`, `description` | Lead, actor User | `LeadActivityType` | descriptions and metadata may contain PII | Preserve event timestamps and actors. Legacy events must remain distinguishable; do not flatten history unless source structure forces it and business approves. |
| `FollowUp` | Scheduled/completed callback or action | `id` | `leadId`, assigned user, `type`, `scheduledAt`, `note`, creator | Lead; assigned/completed/creator Users | `FollowUpType`, `FollowUpStatus` | notes, action timing | Preserve future actions and completion state. Notification timestamp fields must not cause historical notifications. |
| `SaleSubmission` | Sale-made/payment-card admin handover | `id`; unique `leadId` | Lead, Customer, submitting User; status defaulted | Lead, Customer, submitter, optional Booking, attribution | `SaleSubmissionStatus`, `PaymentMethod` | price/deposit, payment reference, sales notes | At most one per Lead. Money is Decimal(12,2); source precision/currency/status must be profiled first. |

Current lead status values are `NEW`, `HANDLING`, `QUOTING`, `FOLLOW_UP`, `CALLBACK`, `GOING_TO_BOOK`, `SALE_MADE`, `BOOKED_ELSEWHERE`, `NOT_INTERESTED`, `NO_RESPONSE`, and `TRAVEL_IN_FUTURE`. They are target values only—not approved mappings.

## Booking and operations

| Model | Purpose | Primary key / unique fields | Required fields | Relationships | Relevant enums | Sensitive fields | Migration notes |
|---|---|---|---|---|---|---|---|
| `Booking` | Operational folder and lifecycle root | `id`; unique `folderNumber`, `leadId`, `saleSubmissionId` | customer, lead, sale, sales advisor, destination, start date, selling price, currency, creator | Customer, Lead, SaleSubmission, Users; passengers, suppliers, references, docs, notes, tasks, finance | `BookingStatus`, `TravelStatus`, `OperationsStatus`, `AccountsStatus`, `FolderStatus` | itinerary, value, ownership, reopen reason | Target requires one-to-one Lead and SaleSubmission. Legacy sales without these parents need an explicit exception/design. Preserve compatible legacy folder numbers; do not regenerate blindly. |
| `Passenger` | Traveller attached to a Booking | `id`; no business unique constraint | `bookingId`, first/last name | Booking | none | passport number/expiry, DOB, nationality, contact details | Current target links Passenger to Booking, not directly Customer. Passport data requires restricted handling; no raw samples. |
| `Supplier` | Reusable travel supplier | `id`; no unique business field | `name`, `supplierType` | BookingSupplier, BookingReference | `SupplierType` | supplier contacts | Similar names are not sufficient for automatic merges. |
| `BookingSupplier` | Supplier service on a booking | `id`; no composite unique constraint | booking, supplier, service type; status defaulted | Booking, Supplier, SupplierPayment | `BookingSupplierStatus` | cost, references, notes | Cost is Decimal(12,2), currency optional. Preserve separate services even for same supplier. |
| `BookingReference` | PNR/ticket/supplier reference | `id`; no business unique constraint | booking, type, reference | Booking, optional Supplier | `BookingReferenceType` | PNR/ticket identifiers | Treat values as sensitive operational identifiers; profile duplicates without publishing values. |
| `BookingDocument` | Booking attachment metadata | `id`; no business unique constraint | booking, file name/type, private storage key, category, uploader | Booking, uploader User | `BookingDocumentCategory` | document names/keys and underlying files | Source discovery must inventory metadata only. Copying files is outside Step 24; target durable storage/scanning must be ready first. |
| `BookingNote` | Booking timeline note | `id` | booking, content, creator | Booking, User | none | free-text PII | Preserve timestamp and actor; avoid truncation and unsafe logs. |
| `BookingTask` | Operational booking task | `id` | booking, title, creator; status defaulted | Booking, optional assignee, creator | `BookingTaskStatus` | descriptions and timing | Map assignee through approved user map; historical tasks must not trigger notifications. |

## Accounts and reconciliation

| Model | Purpose | Primary key / unique fields | Required fields | Relationships | Relevant enums | Sensitive fields | Migration notes |
|---|---|---|---|---|---|---|---|
| `BookingFinance` | Per-booking expected financial summary | `id`; unique `bookingId` | booking, selling price, expected revenue/profit, currency; cost/fees/discounts/adjustments default 0 | Booking | none | all financial values | All money Decimal(12,2). Identify which source values are stored versus calculated; do not trust or recompute profit silently. |
| `PassengerPayment` | Incoming customer/passenger payment | `id` | booking, amount, currency, method, payment date, recorder; status defaulted | Booking; recorder/verifier Users | `PaymentMethod`, `PassengerPaymentStatus` | payment reference, amount, notes | No source-stable unique key exists. Idempotent import needs migration reference metadata before loading. |
| `SupplierPayment` | Outgoing supplier payment | `id` | booking, booking-supplier, amount, currency, payment date, recorder; status defaulted | Booking, BookingSupplier, recorder/verifier Users | `SupplierPaymentStatus` | payment reference, amount, notes | Validate both parent relations and totals per currency; preserve precision. |
| `BookingAdjustment` | Fee/discount/refund/manual adjustment | `id` | booking, type, amount, currency, reason, creator | Booking, creator/approver Users | `BookingAdjustmentType` | financial reason/value | Approval state and actor must be evidenced, not inferred. |
| `Reconciliation` | Per-booking finance verification | `id`; unique `bookingId` | booking; status and checks defaulted | Booking, optional reconciler, discrepancies | `ReconciliationStatus` | notes and verification state | Historical “reconciled” must meet agreed evidence rules; do not copy a label blindly. |
| `ReconciliationDiscrepancy` | Tracked reconciliation mismatch | `id` | reconciliation, booking, type, description, creator; status defaulted | Reconciliation, Booking, assigned/creator/resolver Users | `DiscrepancyType`, `DiscrepancyStatus` | amounts, resolution notes | Ensure reconciliation and booking agree; retain unresolved historical items. |

## Marketing attribution relevant to CRM history

| Model | Purpose | Primary key / unique fields | Required fields | Relationships | Relevant enums | Sensitive fields | Migration notes |
|---|---|---|---|---|---|---|---|
| `MarketingCampaign` | ERP campaign root | `id`; unique `campaignCode` | code, name, owner, creator/updater; status defaulted | Users, optional Deal, content/calendar/events/attribution | `MarketingCampaignStatus` | campaign ownership/strategy | Only create historical campaigns when the source provides reliable campaign identity and business confirms scope. |
| `MarketingSalesSignal` | Sales-to-Marketing signal | `id` | creator, type, title, description; status/priority defaulted | User; optional Lead/Customer | signal/status/priority enums | free text, linked customer | Do not manufacture signals from legacy activity or trigger alerts during import. |
| `MarketingAttribution` | Lead/customer conversion attribution | `id`; unique `(source, externalReference)` | Lead, Customer, confidence, source, creator | optional Campaign/Deal/Content/Publication/Sale/Booking | `MarketingAttributionConfidence`, `MarketingAttributionSource` | UTM/external refs and customer linkage | Missing reliable history should remain `UNATTRIBUTED`; never infer attribution. Stable external references may aid idempotency after validation. |

## Target gaps that must be resolved before test migration

1. Core business models do not carry generic `legacySystem`/`legacyId` fields and most lack a source-stable unique key.
2. `AuditLog` cannot cleanly distinguish legacy history and requires a current User actor plus UUID entity ID.
3. `Booking` requires a Lead and SaleSubmission, which may not match legacy cardinality.
4. Historical automation suppression is not represented by a common import mode/source field.
5. User/Employee representation for former agents is not decided.

Before Step 25, review a generic `MigrationReference` design with unique `(sourceSystem, sourceEntity, sourceId)`, target entity/ID, batch ID, timestamps, and import status. Prefer this over adding legacy columns to every model, but do not implement it until real source cardinalities and governance are known.

