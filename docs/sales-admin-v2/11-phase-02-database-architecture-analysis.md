# Phase 02 — Database Schema & Module Integration Analysis

Analysis date: 2026-11-18  
Source of truth: current `test` branch working tree, especially `backend/prisma/schema.prisma`, 37 committed migration directories, and the listed backend modules. This report is analysis only. No source, schema, migration, database, HR, dependency, deployment, commit or external-service change was made.

Verification: `npx.cmd prisma validate` passed against the current schema. No database connection or migration execution was required.

## Executive decision

The existing architecture safely supports the current linear workflow:

```text
Customer -> Lead -> SaleSubmission -> Booking -> Operations / Accounts
```

It does **not** structurally support multiple products, immutable Sales product snapshots, product-level Operations, planned installments, deposit approval, structured amendments, passenger requests, or Admin verification. The safest extension is **Option B**: keep `SaleSubmission` as the Payment Card aggregate, add immutable `SaleProduct` children for the accepted Sales snapshot, then create separately mutable `BookingProduct` children linked back to their Sales origin. This preserves history and fits the existing Booking/finance boundary.

---

# A. Existing Database Architecture Summary

## Architecture characteristics

- PostgreSQL through Prisma 7.9.1; UUID primary keys dominate domain models.
- Money uses PostgreSQL `Decimal/Numeric`, not floating-point types.
- Workflow models use explicit enums, timestamps, actor FKs and service-layer transactions.
- Historical Sales/Booking FKs predominantly use `RESTRICT`; optional ownership/approval actors use `SET NULL`.
- RBAC is role/permission based and enforced by Nest guards and service checks, not row-level PostgreSQL policies.
- `AuditLog` stores actor/entity/action, changed old/new JSON, request metadata and timestamps. Sensitive key names are removed before persistence.
- Current files are metadata records (`fileName`, `fileType`, `storageKey`, category, uploader); no binary or storage provider is implemented.

## Existing workflow integrity

| Rule | Current protection |
|---|---|
| One SaleSubmission per Lead | `SaleSubmission.leadId @unique`, service pre-check, transaction and unique-error handling |
| One Booking per SaleSubmission | `Booking.saleSubmissionId @unique`, relation check, transaction and unique-error handling |
| One Booking per Lead | `Booking.leadId @unique` |
| Unique folder number | `Booking.folderNumber @unique`; transactional yearly `FolderCounter` |
| Customer traceability | Required Customer FK on Lead, SaleSubmission and Booking |
| Sales advisor traceability | Required `submittedByUserId` and copied `Booking.salesAdvisorId` |
| Concurrent lead claim | Conditional atomic `updateMany` on `id + NEW + assignedUserId null`; exactly one update must succeed |

## Migration history

The committed history is incremental: core identity, Customer 360, Sales Lead Centre, audit/notifications, follow-ups/attention, Sales/Admin handover, Booking Operations, Accounts reconciliation, lifecycle, HR/IT, integrations/Marketing, Accounting and later HR/access changes. Relevant constraints in migrations agree with the current schema's principal `RESTRICT`, `SET NULL` and `CASCADE` choices. No replacement initial migration is appropriate.

---

# B. Existing Models and Purpose

## Identity and access

| Model | Purpose and important integrity |
|---|---|
| `User` | Login identity; unique email; optional Department; many domain actor/owner relations. |
| `Employee` | HR identity; optional unique `userId`; unique employee number; Department required; manager/position/user optional. User deletion sets employee link null. |
| `Department` | Unique organizational unit shared by Users and Employees. |
| `Role`, `Permission` | Unique role name and permission code. |
| `UserRole`, `RolePermission` | Composite-primary-key join tables; cascade only removes access mappings, not business records. |
| `Position`, `PositionRoleMapping` | Optional HR position to auto-role mapping; separate from business ownership. |

## Sales and CRM

| Model | Purpose and important integrity |
|---|---|
| `Customer` | Person/contact/classification. Indexed email/phones but not unique; one-to-many Leads and Bookings. |
| `CustomerNote` | Customer note history. Cascades if Customer is deleted, although downstream `RESTRICT` normally prevents deletion of active history. |
| `Lead` | One customer inquiry with optional assigned User, status/source/destination/travel date, attention state and timestamps. |
| `LeadActivity` | Typed immutable-style activity/audit trail; cascades with Lead. |
| `FollowUp` | Multiple scheduled callbacks/follow-ups per Lead with owner, creator, completion and notification timestamps. |
| `CallLog` | Optional Lead/Customer call association; those FKs set null to preserve call record. |
| `MarketingSalesSignal` | Structured Sales-to-Marketing communication, optionally linked to Lead and Customer. |
| `MarketingAttribution` | Campaign/deal/content/publication attribution to required Lead/Customer and optional SaleSubmission/Booking; includes UTM strings. |

There is no `Quotation`, quotation version, quotation line or quotation acceptance model.

## Sales handover

`SaleSubmission` is the current **Payment Card aggregate**. It contains one Lead/Customer/advisor, destination/dates, one selling price, one deposit amount, one currency, one payment method/reference, notes and workflow status. `leadId` is unique. The service allows editing only while `DRAFT`, validates completeness on submission, changes the Lead to `SALE_MADE`, notifies Admin, and later permits Admin acceptance.

There is no product child, installment schedule, deposit request, Admin rejection action, processing Admin owner or Sales attachment relationship.

## Booking and Operations

| Model | Purpose and important integrity |
|---|---|
| `Booking` | Unique folder/Lead/submission; required customer and Sales advisor; optional Operations owner; separate booking/travel/operations/accounts/folder states. |
| `Passenger` | Multiple passengers with identity/contact/passport and primary-passenger flag. No special-request structure. |
| `Supplier` | Reusable supplier master with type/contact/active state. |
| `BookingSupplier` | Booking-to-Supplier engagement with service type, supplier reference, cost/currency/status/notes. It is not a product. |
| `BookingReference` | Booking-wide typed PNR/airline/hotel/supplier/ticket/other reference; optional Supplier. |
| `BookingDocument` | Booking-scoped file metadata and uploader; optional invoice relationships. |
| `BookingNote` | Operational notes with creator and timestamps. |
| `BookingTask` | General task/reminder primitive with optional assignee/due date and status. |
| `FolderCounter` | Transactional yearly sequence source. |

There is no `BookingProduct`, product status, schedule change or Admin verification structure.

## Financial records

| Model | Purpose |
|---|---|
| `BookingFinance` | One Booking summary: selling price, supplier cost, fees, discounts, adjustments, expected revenue/profit and currency. |
| `PassengerPayment` | Actual customer receipt with original amount/currency, exchange/base values, method/reference/date/status and verification. Multiple partial receipts are supported. |
| `SupplierPayment` | Actual BookingSupplier-linked payment-out with the same currency/verification pattern. |
| `BookingAdjustment` | Fee, discount, refund or manual adjustment with optional approval. |
| `CustomerInvoice`, `SupplierInvoice` | Invoice workflow with original/base amounts, FX snapshot, due date, status and optional BookingDocument. |
| `CustomerAdvance`, `SupplierAdvance` | Actual advances and reversible invoice allocations. These are not planned deposits. |
| `Reconciliation` | One financial checklist/status per Booking. |
| `ReconciliationDiscrepancy` | Assigned, resolvable structured financial exception. |

---

# C. Current Entity Relationships

## Customer inquiry and booking history

The schema correctly supports:

```text
Customer 1 -- * Lead
Customer 1 -- * SaleSubmission
Customer 1 -- * Booking
Lead     1 -- * LeadActivity
Lead     1 -- * FollowUp
Lead     1 -- 0..1 SaleSubmission
Lead     1 -- 0..1 Booking
```

Database relationships are sufficient for complete inquiry and booking history. The current Customer 360 service returns booking rows and only a Lead count; complete inquiry rows are an API/query gap, not a schema gap.

## Contact and classification

- `Customer.email` is the primary email by current convention; `phone` is primary and `secondaryPhone` is separate.
- Email and phone are indexed but not unique. Duplicate detection is advisory: case-insensitive exact email or exact normalized-as-entered phone, up to five matches, with an explicit override flag.
- `CustomerType` is `NEW`, `REPEAT`, `REFERRAL`. “Marketing / New” must be clarified: if it means acquisition medium, it belongs on the Lead, not in CustomerType.
- `Lead.source` is optional free text. It is insufficient for stable structured reporting without controlled normalization.

## Ownership, reassignment and attention

- Lead owner is optional `assignedUserId`; deletion sets it null while creator is required/restricted.
- Reassignment updates owner and scheduled follow-ups transactionally, writes activity/audit and sends notification.
- Multiple FollowUps, future scheduling and callback type are fully modeled.
- Attention has explicit boolean/reason/since fields and next/last activity timestamps. Scheduler/service logic performs deduplicated notifications.

## Primary contact security

No database column is needed. The current `PATCH /customers/:id` accepts all fields under one `customer.edit` permission, so the requirement is **not enforced**. The correct boundary is backend DTO/service authorization:

1. retain one Customer row;
2. require an Admin-level permission such as a dedicated `customer.primary_contact.edit` when `email` or `phone` changes;
3. continue ordinary `customer.edit` for permitted non-primary fields;
4. audit old/new values and actor;
5. hide or disable controls in the UI, but never rely on UI alone.

---

# D. Missing Models / Fields / Enums / Relationships

## Required-model gap classification

| Concept | Classification | Evidence / recommendation |
|---|---|---|
| Quotation | NEW MODEL LIKELY REQUIRED, subject to business decision | Only `QUOTING` Lead status exists. A versioned/sent/accepted commercial offer cannot be reconstructed from activities. |
| SaleProduct | NEW MODEL LIKELY REQUIRED | SaleSubmission is flat; no multi-product child exists. P0 blocker. |
| BookingProduct | NEW MODEL LIKELY REQUIRED | BookingSupplier is supplier engagement, not customer product. P0 blocker. |
| PaymentInstallment / PaymentPlan | NEW MODEL LIKELY REQUIRED | Actual payment rows exist, but no planned obligation/due date. |
| DepositRequest | NEW MODEL LIKELY REQUIRED | `depositAmount` is only a scalar; advances record actual funds. |
| DepositApproval | NEW MODEL LIKELY REQUIRED if multi-step/history is required | Existing Admin acceptance and adjustment approval are different domains. |
| ScheduleChange | NEW MODEL LIKELY REQUIRED | Booking date edits plus AuditLog cannot express resolution/customer-contact workflow. |
| PassengerSpecialRequest | NEW MODEL LIKELY REQUIRED | Passenger has no assistance/request fields; request can be product-specific. |
| AdminVerificationChecklist | NEW MODEL LIKELY REQUIRED | Reconciliation is financial and occurs at a different gate. |
| PaymentEvidence | PARTIAL / EXISTING MODEL CAN BE EXTENDED | BookingDocument metadata is reusable, but secure storage and typed payment links are absent. |
| CreditVoucher | BUSINESS DECISION REQUIRED | No model/reference. Meaning—customer credit, supplier credit or payment instrument—is unconfirmed. |
| SupplierPaymentDeadline | PARTIAL / EXISTING MODEL CAN BE EXTENDED | SupplierInvoice has `dueDate`; pre-invoice contractual deadline is missing and likely belongs to BookingSupplier/product engagement. |
| FreeCancellationDeadline | NEW FIELD/RELATIONSHIP LIKELY REQUIRED | Generic task due dates are not sufficient if cancellation logic depends on the deadline. |

## Marketing Medium / Lead Source recommendation

Keep Customer classification separate. Because acquisition values will evolve and may need active/inactive state, display label, external mappings and reporting order, prefer a small configurable lookup model (for example `LeadSourceDefinition`) with a unique stable code. Add a nullable FK to Lead while retaining legacy `source` during migration. An enum is safe only if values are centrally fixed and deployments are acceptable for every change; an unconstrained string preserves typos and weak reporting.

## Quotation recommendation

Create a Quotation aggregate only if the business needs versions, sent dates, validity, acceptance/rejection or a legally/commercially reproducible offer. If Sales merely records a conversation, keep it as LeadActivity. Confirmed versioned product pricing justifies `Quotation` plus quotation product/line snapshots linked to Lead; it should not be implemented as mutable Lead fields.

## SaleSubmission / PaymentCard decision

Continue using **`SaleSubmission` as the Payment Card aggregate**.

- A separate `PaymentCard` would duplicate owner, Lead, Customer, submission status and Admin handover.
- Existing URLs, permissions, tests, unique constraints, notifications and Booking FK already treat SaleSubmission as the card.
- Add child structures to SaleSubmission rather than replacing it.
- Keep existing flat fields temporarily for backward compatibility; define totals as derived or legacy during migration rather than maintaining two silent sources of truth indefinitely.

## SaleProduct vs BookingProduct decision

### Option A — one shared mutable Product

Lowest table count, but unsafe: Admin/Operations changes would overwrite what Sales submitted; post-submission additions blur ownership; cancellation and supplier amendments alter historical evidence.

### Option B — separate SaleProduct and BookingProduct, linked

**Recommended.** SaleProduct becomes immutable after submission. Admin acceptance creates BookingProduct copies linked through `sourceSaleProductId`. BookingProduct is the operational record and can change without erasing Sales history. Admin-added products use null source and explicit origin/creator.

### Option C — one versioned product/event stream

Can preserve history but adds substantial read/query/version complexity inconsistent with the current CRUD-plus-audit architecture.

Option B best preserves submission, supports Admin amendments/additions, keeps finance on Booking, and permits gradual additive migration. Do not force `sourceSaleProductId` unique until the business confirms whether one Sales product can split into multiple operational products.

## Original Sales snapshot

- Existing SaleSubmission becomes effectively immutable after submit because service updates are DRAFT-only.
- Future SaleProducts should follow the same rule: immutable after `SUBMITTED_TO_ADMIN`.
- BookingProduct copies preserve operational state; copy commercially relevant submitted values rather than reading them live from SaleProduct.
- Link each copy to its source and record creator/origin (`SALES_HANDOVER`, `ADMIN_ADDED`, possibly later `OPERATIONS_ADDED`).
- AuditLog records who copied/changed data; structured Booking amendment/schedule history records domain events that must be queried or resolved.

## Product references and attachments

- Extend `BookingReference` with nullable `bookingProductId` after BookingProduct exists; preserve `bookingId` for efficient folder scope and legacy rows. Do not add PNR columns to every product type.
- A reference can remain booking-wide when productId is null.
- Do not use an unchecked polymorphic `(ownerType, ownerId)` pair because PostgreSQL cannot enforce those FKs.
- Existing BookingDocument is booking-only and exposes a storage key. For future cross-domain files, introduce a shared storage asset/metadata boundary with typed link tables, or evolve additively with typed nullable FKs plus a database check constraint. Typed links are safer.
- Actual file bytes belong in private object storage, not PostgreSQL. Serve upload/download through authorized backend endpoints using opaque keys or short-lived signed access.

## Sales intent vs actual payments

| Concept | Correct record |
|---|---|
| Planned method/deposit/installment | SaleSubmission child plan/installment records |
| Actual customer receipt | `PassengerPayment` and/or `CustomerAdvance` |
| Customer amount due | `CustomerInvoice` |
| Allocation of advance | `CustomerAdvanceAllocation` |
| Supplier amount paid | `SupplierPayment` |

A planned installment must never become a second accounting ledger. Link actual receipts through allocation records when partial/many-to-many settlement is required. Do not assume one installment equals one receipt.

## Admin processor and post-submission additions

`operationsOwnerId` is not an Admin processor. `createdById` records Booking creator but not queue ownership. If Admin work assignment/claiming is required, add nullable processing ownership on SaleSubmission (processor User, assigned/processed timestamps) with indexes for queue state. AuditLog alone is adequate for “who accepted” history, but not for current workload ownership.

Admin-added BookingProducts should have `sourceSaleProductId = null`, `origin = ADMIN_ADDED`, required `createdById` and `createdAt`. Sales-origin products use `origin = SALES_HANDOVER`. Do not insert Admin additions back into immutable SaleProducts.

## Amendment, status, schedule and ticket tracking

- Keep Booking, Operations, Travel and Product statuses separate.
- Product status should initially include only confirmed operational states; do not mirror every Booking enum value.
- Use BookingProduct as current state plus a structured amendment/event model for supplier, itinerary, date, price and cancellation changes that need business querying.
- Use a dedicated ScheduleChange child when customer-contact-required, follow-up due and resolved state are required; AuditLog alone is not an operational work queue.
- Ticket issuance belongs on the relevant flight BookingProduct or a product ticket child when multiple tickets/passengers exist. Booking-level `TICKETING_PENDING` remains an aggregate signal, not authoritative per-product issuance.

## Supplier deadlines

- `SupplierInvoice.dueDate` remains the accounting payable deadline after an invoice exists.
- A pre-invoice supplier payment deadline and free-cancellation cutoff describe the supplier engagement/terms, so they belong on `BookingSupplier` or a product-supplier association, not on Booking globally.
- Store timestamps with explicit time-zone convention where cutoffs include time; dates are insufficient for airline/hotel deadlines.

## Passenger special requests

Use a normalized `PassengerSpecialRequest` linked to Passenger and optionally BookingProduct. This supports multiple typed/free-text requests, status, privacy, product scope and audit. Fixed wheelchair/meal/medical columns would grow poorly and cannot express product-specific applicability. Medical details require stricter read permission and retention policy.

## Admin verification

Use configurable checklist templates/items and per-Booking responses/attestations if checklist content can evolve. Fixed booleans require migrations for every policy change; BookingTask lacks attestation/version semantics. Financial Reconciliation must remain separate.

---

# E. Database Requirement Coverage Table

| Requirement | Existing Model | Current Support | Required Change | Priority |
|---|---|---|---|---|
| Customer many inquiries/bookings | Customer/Lead/Booking | Existing | API expansion only | P1 |
| Primary contact Admin edit | Customer/User permissions | Missing enforcement | Backend field-level permission; no schema change | P1 |
| Customer classification | CustomerType | Existing, terminology unclear | Confirm Marketing/New meaning | P3 |
| Structured Marketing Medium | Lead.source / Attribution UTM | Partial | Lookup + nullable Lead FK; migrate gradually | P1 |
| Quotation versions/products | None | Missing | New aggregate if confirmed | P2 |
| Payment Card aggregate | SaleSubmission | Existing V1 | Retain and extend | P0 |
| Multiple Sales products | None | Missing | SaleProduct | P0 |
| Immutable Sales snapshot | Draft-only SaleSubmission | Partial | Freeze SaleProducts after submit | P0 |
| Operational products | BookingSupplier only | Missing | BookingProduct linked to SaleProduct | P0 |
| Admin-added product origin | User/Audit only | Missing | origin + creator on BookingProduct | P1 |
| Admin reject/return | Enum only | Missing | Workflow action/state metadata; no duplicate aggregate | P1 |
| Admin processing owner | Booking creator/Operations owner | Missing | Optional SaleSubmission processor fields if assignment required | P2 |
| Product references | BookingReference | Partial | Nullable product FK; retain booking scope | P1 |
| Product supplier | BookingSupplier | Partial | Nullable product FK or join | P1 |
| Product documents | BookingDocument | Partial | Secure file asset + typed links | P1 |
| Multiple payment methods/intents | SaleSubmission single method | Partial | Planned payment schedule/splits | P1 |
| Actual partial payments | PassengerPayment/Advance | Existing | Reuse, link allocations only | P1 |
| Installment schedule | None | Missing | PaymentInstallment plan | P1 |
| Deposit request/approval | Scalar deposit amount | Missing | Sales-specific request/approval after rules confirmed | P1 |
| Product status | Booking/Supplier status | Missing | Separate product enum/state | P1 |
| Product amendments | AuditLog only | Partial | Structured amendment/event for operational queries | P1 |
| Schedule change workflow | None | Missing | ScheduleChange child | P2 |
| Ticket issuance per product | Booking status/reference | Partial | Product/ticket state and actor/time | P1 |
| Supplier payment deadline | Invoice due date | Partial | Supplier-engagement cutoff | P1 |
| Free cancellation deadline | None | Missing | Supplier-engagement cutoff | P1 |
| Passenger special requests | Passenger | Missing | Normalized request entity | P2 |
| Admin verification | Reconciliation (wrong domain) | Missing | Separate checklist run/items | P1 |
| Revenue/cost/profit | BookingFinance | Existing booking-level | Product allocation only if confirmed | P2 |
| Surcharge | Adjustment/fees | Partial | Reuse and optionally product-link | P2 |
| Customer payment-in | PassengerPayment | Existing | Reuse | P1 |
| Supplier payment-out | SupplierPayment | Existing | Reuse | P1 |
| Multi-currency originals | Payment/invoice/advance | Existing | Reuse | P1 |
| GBP equivalent | base fields default LKR | Partial | Reporting-currency decision; do not relabel LKR base amount | P2 |
| Conversion fee | BookingFinance fees only | Missing transaction-level meaning | Confirm placement/calculation | P3 |
| Payment evidence | BookingDocument metadata | Partial | Secure storage and typed payment link | P1 |
| Credit voucher | None | Missing/unconfirmed | Define domain first | P3 |
| Reconciliation integration | Reconciliation/discrepancy | Existing booking-level | Include product totals/evidence without replacing workflow | P2 |

---

# F. Recommended Schema Amendments

These are conceptual amendments, not Prisma definitions or migrations.

## 1. Lead source definition and Lead relationship

- **Existing/New:** new lookup; extend Lead.
- **Reason:** stable reporting without deployment-coupled enum values.
- **Key fields:** stable unique code, label, active/order; optional external mapping only when needed.
- **Relationships:** Lead nullable FK; keep legacy `source` during transition.
- **Constraints/indexes:** unique code; index active/order; index Lead FK and createdAt for reports.
- **Audit:** definition changes and Lead source changes.
- **Migration impact:** additive; map known strings; leave unknown legacy values intact.
- **Alternative:** enum rejected unless value set is confirmed immutable.

## 2. SaleProduct

- **Existing/New:** new child of SaleSubmission.
- **Reason:** multiple products and immutable submitted snapshot.
- **Key fields:** confirmed product type, description, service dates, submitted commercial amounts/currency, notes, status only if Sales needs it; supplier/reference should use relations rather than duplicate strings where justified.
- **Relationships:** required SaleSubmission; creator User; optional supplier/reference/attachments according to confirmed capture scope.
- **Constraints/indexes:** index submission/order/type; stable position/order; no speculative global uniqueness.
- **Audit:** create/update before submit; submission freeze event.
- **Migration impact:** additive; existing flat submissions remain valid; optional backfill one legacy product only after mapping rules are approved.
- **Alternative:** shared mutable Product rejected because it erases Sales history.

## 3. BookingProduct

- **Existing/New:** new child of Booking.
- **Reason:** product-level Operations independent of Sales snapshot and Booking aggregate states.
- **Key fields:** product type, operational description/dates/current status/origin, creator, optional sourceSaleProductId; only confirmed operational values.
- **Relationships:** required Booking; optional source SaleProduct; related BookingSupplier, BookingReference, tasks/documents as required.
- **Constraints/indexes:** indexes `(bookingId,status)`, sourceSaleProductId, service dates; do not force one-to-one source until split/merge rules are confirmed.
- **Audit:** creation origin, changes, cancellation and source-copy metadata.
- **Migration impact:** additive; legacy Booking remains usable; later optional legacy product backfill.
- **Alternative:** BookingSupplier rejected as product because supplier engagement and customer product are different facts.

## 4. BookingSupplier and BookingReference extensions

- **Existing/New:** extend existing models.
- **Reason:** product-scoped supplier engagement, references and contractual deadlines.
- **Key fields:** nullable BookingProduct FK; confirmed payment/free-cancellation cutoff timestamps on BookingSupplier.
- **Relationships:** preserve Booking and Supplier FKs.
- **Constraints/indexes:** index product FK and deadline/status; reference uniqueness only after domain confirmation.
- **Audit:** supplier/reference/deadline changes.
- **Migration impact:** nullable/additive; all legacy rows remain booking-wide.
- **Alternative:** new per-product supplier/reference tables rejected as duplication.

## 5. PaymentInstallment and allocation

- **Existing/New:** new non-accounting plan under SaleSubmission; optional allocation child to actual PassengerPayment/Advance.
- **Reason:** distinguish expected installments from receipts.
- **Key fields:** amount, currency, expected date, intended method, plan status/order.
- **Relationships:** SaleSubmission; allocations to actual payment records only after settlement rules are confirmed.
- **Constraints/indexes:** submission/due/status indexes; decimal money; no unique external reference assumption.
- **Audit:** schedule changes and settlement links.
- **Migration impact:** additive; legacy deposit amount retained.
- **Alternative:** using PassengerPayment as a plan rejected because it is an actual finance record.

## 6. DepositRequest / approval history

- **Existing/New:** new Sales-specific request if approvals are confirmed; child approval history only if multiple decisions/reviews are needed.
- **Reason:** request/decision is not an actual advance or general Sale acceptance.
- **Key fields:** requested amount/currency, reason, requester, state, reviewer/decision/reason/timestamps.
- **Relationships:** SaleSubmission and Users.
- **Constraints/indexes:** one active request rule should be service/partial-index backed only after confirmed; queue index by state/date.
- **Audit:** all request and decision transitions.
- **Migration impact:** additive.
- **Alternative:** generic approval engine deferred because current approvals are domain-specific and a general engine is unjustified.

## 7. Booking amendment and ScheduleChange

- **Existing/New:** structured amendment/event; specialized ScheduleChange details when workflow fields are required.
- **Reason:** `updatedAt` and generic JSON audit are insufficient for active resolution/customer-contact queues.
- **Key fields:** product/booking, typed change, old/new structured payload or schedule fields, reason, actor/time, contact-required, follow-up due, resolution state.
- **Relationships:** BookingProduct/Booking and User.
- **Constraints/indexes:** product/date/state/due indexes.
- **Audit:** domain event plus AuditLog for security trace.
- **Migration impact:** additive; no historical reconstruction should be invented.
- **Alternative:** full event sourcing rejected as incompatible complexity.

## 8. PassengerSpecialRequest

- **Existing/New:** new normalized entity.
- **Reason:** multiple, sensitive and product-scoped requests.
- **Key fields:** type, description, status, sensitivity classification only if required, timestamps.
- **Relationships:** required Passenger; optional BookingProduct; creator/assignee if workflow requires.
- **Constraints/indexes:** passenger/product/status; no fixed one-request-per-type assumption without confirmation.
- **Audit:** create/update/access-sensitive changes.
- **Migration impact:** additive; no Passenger rewrite.
- **Alternative:** fixed Passenger columns rejected for poor normalization/product scope.

## 9. Admin verification checklist

- **Existing/New:** checklist template/version/items plus Booking run/responses.
- **Reason:** maintainable policy and immutable evidence of which checklist version was completed.
- **Key fields:** template/version/active, item code/label/order, response/result/comment/verified actor/time.
- **Relationships:** Booking and Users; optional product/evidence link when confirmed.
- **Constraints/indexes:** unique item code within template version; one response per run/item; Booking/status index.
- **Audit:** item responses, completion/reopening/invalidation.
- **Migration impact:** additive.
- **Alternative:** fixed booleans and Reconciliation reuse rejected.

## 10. Secure document asset and typed links

- **Existing/New:** retain BookingDocument compatibility; add secure file service/asset metadata and typed domain links incrementally.
- **Reason:** Sales screenshots and payment evidence exist before or below Booking scope.
- **Key fields:** opaque storage key, original filename, trusted MIME, size, checksum, uploader/time, security classification; no binary column.
- **Relationships:** typed link records to SaleProduct, BookingProduct, PassengerPayment, SupplierPayment or voucher as required.
- **Constraints/indexes:** unique opaque object key; checksum index (not necessarily unique); owner/link indexes.
- **Audit:** upload, link, access/download and removal/retention events.
- **Migration impact:** additive; backfill assets for existing BookingDocument only when real objects exist.
- **Alternative:** unchecked polymorphic owner IDs rejected for FK integrity.

## 11. Optional Admin processor fields

- **Existing/New:** extend SaleSubmission only if Admin queue assignment is confirmed.
- **Reason:** current actor audit does not represent current ownership.
- **Key fields:** processor User FK, assignedAt, processedAt; acceptance/rejection actor can remain AuditLog or explicit decision history.
- **Constraints/indexes:** `(status, processingAdminId, submittedAt)`.
- **Audit:** assignment/reassignment/decision.
- **Migration impact:** nullable/additive.
- **Alternative:** operationsOwnerId rejected because roles differ.

---

# G. Proposed Sales-to-Admin ER Diagram

```text
User 0..1 -------- 1 Employee                     Role * -- * Permission
  |                    |                              via join tables
  | actor/owner        +-- Department / Manager
  |
Customer 1
  |-- * CustomerNote
  |-- * Lead
  |      |-- * LeadActivity
  |      |-- * FollowUp
  |      |-- 0..* Quotation [only if versioned quotation is confirmed]
  |      |
  |      `-- 0..1 SaleSubmission (Payment Card; one per Lead)
  |              |-- * SaleProduct (immutable after submission)
  |              |      |-- * sale-product reference/document links
  |              |      `-- optional Supplier reference
  |              |-- * PaymentInstallment (planned, non-ledger)
  |              `-- * DepositRequest / decision history [if confirmed]
  |
  `-- * Booking (one per accepted SaleSubmission; also retains Lead/Customer)
          |-- * BookingProduct
          |      |-- 0..* BookingSupplier ---- 1 Supplier
          |      |-- * BookingReference
          |      |-- * product document links
          |      |-- * ScheduleChange / Amendment
          |      `-- 0..* source link to SaleProduct
          |
          |-- * Passenger -- * PassengerSpecialRequest
          |                         `-- optional BookingProduct
          |-- * BookingTask
          |-- * BookingNote
          |-- * BookingDocument (legacy/additive secure asset link)
          |-- * AdminChecklistRun -- * ChecklistResponse
          |
          |-- 0..1 BookingFinance
          |-- * CustomerInvoice -- * PassengerPayment (actual receipts)
          |-- * SupplierInvoice -- * SupplierPayment (actual payments)
          |-- * CustomerAdvance / SupplierAdvance + allocations
          |-- * BookingAdjustment
          `-- 0..1 Reconciliation -- * ReconciliationDiscrepancy

SaleProduct 1 -- 0..* BookingProduct
  (link preserves Sales snapshot; null source means Admin/Operations addition)

SecureFileAsset 1 -- * typed domain link
  -> SaleProduct | BookingProduct | BookingDocument | PassengerPayment | SupplierPayment
```

The diagram intentionally keeps financial transactions under Booking and does not make SaleProduct an accounting ledger.

---

# H. Safe Migration Strategy

1. **Freeze the contract first.** Confirm product types/statuses, Admin return semantics, deposit authority, quotation scope, product split/merge rules, deadlines and GBP reporting policy.
2. **Add only nullable/additive foundations.** Create new lookup/product tables and nullable FKs/indexes. Do not rename/drop flat SaleSubmission or Booking fields.
3. **Preserve existing workflow.** Current records continue through the flat path while new application code can write product rows behind a controlled rollout.
4. **Backfill conservatively.** If approved, create one legacy SaleProduct/BookingProduct only where mapping is deterministic. Mark its origin `LEGACY_BACKFILL`; never invent supplier/product facts.
5. **Validate links.** Compare counts, orphan checks, Lead/Customer/submission consistency, amount/currency consistency and source-to-booking mapping in read-only reports.
6. **Switch reads/writes in stages.** Payment Card V2 writes products; Admin handover copies them; Booking workspace then reads BookingProducts. Retain flat-field fallback for legacy rows.
7. **Add typed relations later.** Product-supplier/reference/document/deadline links become required only for new records after application support and backfill validation.
8. **Enforce immutability in services first.** Block SaleProduct mutation after submission; add database-level protective constraints/triggers only if the team accepts operational complexity.
9. **Tighten constraints last.** Add non-null, unique or check constraints only after production/UAT data proves the rule. Use `NOT VALID`/online-safe PostgreSQL techniques where appropriate.
10. **Never reset or replace migration history.** Each phase gets a reviewable forward migration and rollback/data-recovery plan.

## Existing data compatibility

| Existing record | Future behavior |
|---|---|
| SaleSubmission | Remains valid as legacy flat Payment Card; product relation may be empty until deterministic backfill. |
| Booking | Remains valid; flat totals and current status stay authoritative during transition. |
| BookingSupplier | Remains booking-wide with nullable product link. |
| BookingReference | Remains booking-wide when product link is null. |
| PassengerPayment / SupplierPayment | Remain actual financial truth; no conversion into installments. |
| BookingDocument | Remains valid metadata; do not claim an object exists merely from storageKey. |
| Reconciliation | Continues booking-level; product detail is supporting evidence, not a replacement workflow. |

---

# I. Security & Integrity Risks

## Foreign keys and deletion

| Area | Current behavior | Risk / recommendation |
|---|---|---|
| Customer -> Lead/Submission/Booking | `RESTRICT` downstream | Strong historical protection. Keep archive/deactivate rather than delete. |
| CustomerNote -> Customer | `CASCADE` | Notes disappear if a Customer can ever be deleted. Downstream restrictions usually block it, but no future hard-delete API should bypass history. |
| LeadActivity/FollowUp -> Lead | `CASCADE` | Deleting an unconverted Lead erases CRM history. Prefer lead archival, not hard delete. |
| Assigned User / Operations owner / task assignee | `SET NULL` | Preserves work if a User link is removed; actor history often remains through restricted audit/creator relations. |
| SaleSubmission/Booking spine | `RESTRICT` | Correct: accepted Sales/Booking history cannot be cascaded away. |
| Passenger/BookingSupplier/Reference/Document/Task -> Booking | `RESTRICT` | Correct historical protection. Future products should follow this pattern. |
| Supplier reference | `SET NULL` | Reference text survives supplier deletion; acceptable, but Supplier is already restricted by stronger relationships. |
| Payments/invoices/advances/reconciliation | Mostly `RESTRICT`; optional reviewer/resolver actors `SET NULL` | Correct for finance. Never cascade financial rows from a product. |
| UserRole/RolePermission | `CASCADE` | Appropriate for access mapping only. Does not cascade business data. |

## Duplicate prevention

- Existing Lead/Sale/Booking/folder protections are sufficient and race-aware.
- `BookingReference` has no uniqueness constraint. Do not add global uniqueness: the same airline/hotel reference may legitimately span passengers/products. If confirmed, normalize the value and enforce within a product/type scope.
- Payment references are not unique. Bank references can collide across providers/accounts; any future uniqueness must include provider/account/currency or external transaction identity.
- `BookingDocument.storageKey` is not unique. A secure asset store should issue unique opaque keys. A content checksum helps detect duplicate evidence but should not automatically reject legitimate reuse.
- Supplier invoice uniqueness is correctly scoped to `(supplierId, invoiceNumber)`; Customer invoice number is globally unique.

## Concurrent Lead claiming

The service runs a transaction and performs one conditional SQL update through `updateMany` with `id`, `status = NEW` and `assignedUserId = null`. PostgreSQL row locking/statement atomicity means two claimants cannot both update the same qualifying row; only the winner sees count 1. The loser gets a conflict. No extra unique constraint is needed. Keep the activity, audit, notification and attention update in the same transaction.

## Required atomic transaction boundaries

| Workflow | Current state | Future requirement |
|---|---|---|
| Lead claim | One transaction | Keep owner/status/activity/audit/notification atomic. |
| Sale Made | One transaction plus unique handling | Add initial SaleProduct creation, if any, inside the same boundary. |
| Submit to Admin | One transaction | Freeze products, status, Lead update, activity/audit and Admin notifications atomically. |
| Admin accept | One transaction | Decision and snapshot readiness must be atomic; do not create partially accepted products. |
| Create Booking | One transaction | Counter, Booking, BookingProduct copies, attribution, audit and notifications must commit together. |
| Payments/invoices/advances | BookingFinanceService uses transactions | Keep source transaction, FX snapshot, allocation, GL posting and audit together. |
| Reconciliation | Transactional start/update/complete/discrepancy operations | Product totals/evidence checks must not permit completion on partial writes. |

## Audit and domain history

AuditLog can safely record future product, supplier, PNR, payment, approval and checklist actions if snapshots are string-safe for Decimal/date values and sensitive document content is excluded. It is not a substitute for:

- immutable SaleProduct snapshot rows;
- current BookingProduct state;
- queryable ScheduleChange resolution;
- checklist responses/version;
- installment settlement allocations.

Use AuditLog for actor/security trace and domain tables for business state/history.

## Access control

No database duplication is required for Sales ownership, primary-contact restrictions, financial visibility or document access. Continue backend guards plus service-level row/field checks:

- SaleSubmission detail currently has no method permission decorator but service authorizes owner/privileged users; preserve explicit service checks when products are added.
- Primary contact changes need a dedicated permission checked against changed fields.
- Booking list/detail removes finance values without `finance.view`; new product cost/profit fields need the same projection discipline.
- Deposit approval requires a dedicated permission and self-approval policy.
- Admin processor and Operations owner are distinct User FKs if both are operational concepts.
- Passenger medical/special data and documents need narrower permissions than ordinary `booking.view`.

## Document security

Current state:

- PostgreSQL stores metadata only, not binary files.
- `storageKey` is client-supplied JSON up to 500 characters.
- create is protected by `booking.manage_documents`; booking detail returns document metadata to users with booking access.
- no upload/download endpoint, object-storage adapter, size/checksum enforcement, server-side MIME inspection or signed URL is present.

Risks and recommendations:

1. Never accept arbitrary client-selected storage keys as proof of an uploaded object.
2. Generate opaque keys server-side after authorization.
3. Validate size and detected MIME, scan where required, keep buckets private and authorize every download.
4. Do not expose permanent object credentials or raw public URLs.
5. Separate document category from security classification and retention policy.
6. Add narrower permissions for passport/medical/payment evidence.
7. Store payment evidence as a typed link to the actual payment, while retaining booking scope for navigation.

## Financial precision and currency safety

No relevant Prisma `Float`, PostgreSQL `REAL` or `DOUBLE PRECISION` financial field exists.

| Purpose | Precision |
|---|---|
| Prices, costs, payments, adjustments, invoice totals, advances | `Decimal(12,2)` |
| Base/reporting transaction amounts and ledger amounts | `Decimal(14,2)` |
| Exchange rates | `Decimal(18,8)` |
| Tax rate | `Decimal(7,4)` |

The schema preserves original amount/currency and an exchange-rate/base-currency/base-amount snapshot for payments, invoices and advances. Current default base currency is **LKR**, not GBP. Therefore:

- original transaction value is safe;
- GBP equivalent is **not guaranteed**;
- do not rename or reinterpret `baseAmount` as GBP;
- if GBP is the confirmed reporting currency, either adopt a controlled accounting base-currency policy for new transactions or add an explicit reporting-currency snapshot; this touches Accounting policy and requires separate approval;
- conversion fee is not a transaction-level field and its meaning/formula is unconfirmed.

## Financial coverage classification

| Requirement | Classification | Notes |
|---|---|---|
| Revenue | EXISTING | BookingFinance expected revenue, booking-level. |
| Surcharge | PARTIAL | Fees/adjustments exist; exact surcharge semantics unconfirmed. |
| Cost of Sale | EXISTING/PARTIAL | Booking and supplier cost exist; no product allocation. |
| Profit | EXISTING | Booking-level expected profit. |
| Initial Profit | MISSING / UNCONFIRMED BUSINESS RULE | No separate snapshot. |
| Balanced Profit / TBI | MISSING / UNCONFIRMED BUSINESS RULE | Meaning/formula not defined. |
| Admin Profit | MISSING / UNCONFIRMED BUSINESS RULE | Meaning/formula not defined. |
| Credit Voucher | MISSING / UNCONFIRMED BUSINESS RULE | Domain meaning not defined. |
| Customer Payment-In | EXISTING | PassengerPayment, CustomerAdvance and invoices. |
| Supplier Payment-Out | EXISTING | SupplierPayment/Advance/invoice. |
| Multiple currencies | EXISTING | Original and base snapshots. |
| Original transaction amount | EXISTING | Explicit amount/currency. |
| GBP-equivalent amount | PARTIAL | Base amount exists but defaults to LKR. |
| Exchange rate | EXISTING | Decimal(18,8) snapshot. |
| Conversion fee | MISSING/UNCONFIRMED | Booking-level fees are not necessarily conversion fees. |
| Payment evidence | PARTIAL | Document metadata exists; typed link/storage security absent. |

## Credit vouchers

No voucher model or reference exists. Before modeling, confirm whether this is customer credit, supplier credit, airline voucher, a reusable balance, or merely evidence/reference. Confirm issuer, beneficiary, currency, face/remaining value, expiry, transferability, redemption and accounting treatment. Only then choose Booking, BookingProduct, Supplier and payment relationships.

## Reconciliation integration

Keep current Reconciliation as the Booking-level financial close gate. Future product data should feed it through:

- summed product selling/cost values reconciled to BookingFinance/invoices;
- product supplier obligations tied to current supplier invoices/payments;
- payment evidence linked to actual transactions;
- unresolved product amendments/deadlines exposed as supporting checks only when business rules require them.

Do not turn Admin verification or product Operations status into financial Reconciliation booleans.

---

# J. Recommended Implementation Sequence

1. Confirm business vocabulary and unresolved rules listed below.
2. Add controlled Lead source/medium only if required for V2 reporting.
3. Add SaleProduct and BookingProduct foundations, source/origin links and indexes.
4. Extend Payment Card V2 draft UI/API around SaleProducts; freeze snapshot on submission.
5. Add Admin reject/return/resubmit and optional processing owner.
6. Copy accepted Sales products transactionally into BookingProducts during existing Booking creation.
7. Link existing BookingSupplier and BookingReference to products; add product statuses and Admin-added origin.
8. Add structured amendments/schedule changes and ticket/deadline tracking.
9. Add planned installments and deposit request/approval without changing actual finance ledger records.
10. Add PassengerSpecialRequest and separate Admin checklist.
11. Implement private file storage, then typed product/payment evidence links and clipboard/screenshot upload.
12. Integrate product totals/evidence into existing BookingFinance and Reconciliation views without redesigning Accounting.
13. Backfill only deterministic legacy records, tighten constraints later, and run migration/E2E/UAT against a cloned disposable database.

---

# K. Business Rules Still Requiring Confirmation

1. Does “Marketing / New” mean Customer classification `NEW`, or Marketing acquisition medium?
2. Which Lead statuses are added, removed or renamed, and what happens to existing rows?
3. Are Marketing Medium values configurable by authorized users, and what external provider mappings are required?
4. Does Quotation need versions, expiry, acceptance, documents and conversion to SaleSubmission?
5. Can one SaleProduct split into several BookingProducts or several SaleProducts merge into one?
6. Which product fields are required for each product type?
7. Can Admin edit Sales-submitted data before acceptance, or only create a differing BookingProduct copy?
8. What are reject, return, resubmit and cancel transitions, required reasons and notification recipients?
9. Is an Admin processor assigned/claimed, and can processor differ from accepting Admin?
10. Who may add products after submission/booking, and what approval/repricing is required?
11. Are planned payment methods/installments informational or contractual? How do receipts allocate across them?
12. What triggers a deposit request, who can approve, can approver be requester, and are multiple approvals possible?
13. What exact product statuses are confirmed, by product type?
14. Do schedule changes require customer acknowledgement and escalation deadlines?
15. Is ticket issuance per product, passenger, segment, or ticket number?
16. Are supplier payment and cancellation cutoffs date-only or time-zone-sensitive timestamps?
17. Which passenger requests are sensitive medical data, and who can view them?
18. Is the Admin checklist fixed or configurable/versioned, and what invalidates it after amendments?
19. What do Initial Profit, Balanced Profit/TBI and Admin Profit mean and when are they frozen?
20. Is GBP the organizational reporting currency despite current LKR defaults?
21. What is a conversion fee and where is it charged?
22. What exactly is a Credit Voucher, who issues/owns/redeems it, and how is it accounted for?
23. What retention, download and deletion rules apply to screenshots, passports, medical requests and payment evidence?

---

# L. Models That Should Be Reused Rather Than Duplicated

| Existing model/service | Reuse for | Do not misuse as |
|---|---|---|
| `SaleSubmission` | Payment Card aggregate and Sales/Admin state | Separate duplicate PaymentCard row |
| `Customer`, `Lead`, `LeadActivity` | Inquiry history and ownership/activity | Copied Customer per sale or separate history table |
| `MarketingSalesSignal` | Sales-to-Marketing communication | Another message/signal entity |
| `MarketingAttribution` | Campaign/source conversion links | Customer classification |
| `Supplier` | Supplier master | Product record |
| `BookingSupplier` | Supplier engagement/cost/status/deadlines | BookingProduct itself |
| `BookingReference` | Typed PNR/ticket/supplier references | Repeated PNR columns |
| `BookingTask` | General operational work and due dates | Contractual deadline truth when lifecycle depends on it |
| `BookingDocument` / future secure asset | Booking files and typed evidence links | Binary database storage or arbitrary public URL |
| `PassengerPayment`, `SupplierPayment` | Actual money movements | Planned installment rows |
| Invoices and Advances | Receivables/payables/received advances | Deposit request approval |
| `BookingAdjustment` | Controlled fees/discounts/refunds | Credit voucher balance unless explicitly equivalent |
| `BookingFinance` | Booking-level commercial summary | Parallel product accounting ledger |
| `Reconciliation` / discrepancy | Financial close and exceptions | Admin Operations verification checklist |
| `AuditLog` | Actor/security change trace | Sole source of current domain state or queryable schedule workflow |
| `User` | Business owners/actors/assignees | New Sales/Admin identity tables |

## HR impact

**NO HR MODEL CHANGE REQUIRED.** User and Employee are already optional one-to-one, and domain ownership/tasks use User FKs. New Sales/Admin/Booking actors should continue referencing User. This avoids rewriting Employee, Department, manager, position, attendance, leave or other HR structures.

Migration risks affecting HR are limited to shared User availability: `SET NULL` is suitable for current assignees, while immutable creator/approver history should remain `RESTRICT` or be preserved through deliberate account deactivation rather than User deletion. No proposed Sales/Admin model requires an Employee FK.

---

## Final status

**PHASE 02 COMPLETE — DATABASE ARCHITECTURE ANALYSIS READY FOR REVIEW**

