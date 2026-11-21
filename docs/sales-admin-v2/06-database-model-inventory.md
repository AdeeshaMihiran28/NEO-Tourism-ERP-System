# Database model inventory

Source: `backend/prisma/schema.prisma` plus 37 committed migration directories. Prisma validation passed. This report did not compare against or introspect the live database.

## Core relationship

```text
Customer
  -> Lead (many)
       -> LeadActivity / FollowUp (many)
       -> SaleSubmission (zero or one; leadId unique)
            -> Booking (zero or one; saleSubmissionId unique)
                 -> Passenger / BookingSupplier / BookingReference
                 -> BookingDocument / BookingNote / BookingTask
                 -> BookingFinance / payments / adjustments
                 -> Reconciliation -> ReconciliationDiscrepancy
```

`Booking.customerId` and `Booking.leadId` preserve the originating customer and lead. `Booking.leadId` is unique. Relations from the handover spine use `onDelete: Restrict`, preventing accidental deletion of history.

## CRM and Sales models

| Model | Important fields / constraints | Relationships and behavior |
|---|---|---|
| `Customer` | UUID; email/phone optional and indexed; `CustomerType` defaults `NEW`; active flag; creator/updater | Many notes, leads, submissions and bookings; also finance, calls and Marketing records. Primary email/phone are not unique. |
| `CustomerNote` | content, creator, timestamps; index `(customerId, createdAt)` | Customer cascade; creator restrict. |
| `Lead` | status `NEW`; free-text `source`; destination/travel date; next action; structured attention fields | Belongs to Customer; optional assigned user; many activities/follow-ups; zero/one submission and booking. |
| `LeadActivity` | typed event, description, JSON metadata, user and timestamp | Cascades with Lead; immutable history pattern in services. |
| `FollowUp` | type, scheduled time, note, status, completed/due/missed timestamps | Lead and assigned/creating/completing users; indexes support schedules and owner queues. |
| `SaleSubmission` | `leadId @unique`; customer/advisor; dates; selling/deposit amounts; currency; one `PaymentMethod`; reference/notes; `DRAFT` default | Restrict relations to Lead, Customer and User; optional one Booking. No product lines, installments or document relation. |

Relevant enums: `CustomerType` = NEW/REPEAT/REFERRAL; `LeadStatus` = NEW, HANDLING, QUOTING, FOLLOW_UP, CALLBACK, GOING_TO_BOOK, SALE_MADE, BOOKED_ELSEWHERE, NOT_INTERESTED, NO_RESPONSE, TRAVEL_IN_FUTURE; `FollowUpType` includes CALLBACK; submission states include DRAFT, SUBMITTED_TO_ADMIN, ADMIN_ACCEPTED, ADMIN_REJECTED and CANCELLED.

## Booking and Operations models

| Model | Important fields / constraints | Relationships and behavior |
|---|---|---|
| `FolderCounter` | yearly counter used by service transaction | Generates sequential folder number; Booking also enforces uniqueness. |
| `Booking` | unique `folderNumber`, `leadId`, `saleSubmissionId`; customer/advisor/owner; four status dimensions; dates; price/cost/currency | Parent of all booking operations and finance records; reopen actor/reason fields. |
| `Passenger` | identity, DOB, nationality, passport, contact, primary flag | Many per Booking; no structured assistance/special-request fields. |
| `Supplier` | name, typed category, contacts, active | Reusable supplier master related through `BookingSupplier`. |
| `BookingSupplier` | service type, supplier reference, cost/currency, status, notes | Booking-to-Supplier association; parent for supplier payments/invoices. Closest current product-like record, but lacks product identity/status/deadlines. |
| `BookingReference` | typed PNR/airline/hotel/supplier/ticket/other reference; optional Supplier | Booking-wide reference; not attached to a product or BookingSupplier. |
| `BookingDocument` | filename/type, `storageKey`, category, uploader | Metadata only. It can be linked to customer/supplier invoices, but no upload transport is modeled. |
| `BookingNote` | content/creator/time | Operational note history. |
| `BookingTask` | title/description, optional assigned user/due time, status, creator | General work/reminder primitive with owner/status indexes. |

Status enums cover Booking, Operations, Travel, Accounts and Folder separately. `OperationsStatus` includes `SUPPLIER_PENDING` and `TICKETING_PENDING`; `BookingSupplierStatus` covers PENDING/CONFIRMED/CANCELLED.

## Finance models

| Model | Important fields / constraints | Relationships and behavior |
|---|---|---|
| `BookingFinance` | one per Booking; selling/cost/fees/discounts/adjustments; expected revenue/profit; currency | Booking-level summary, not per product. |
| `PassengerPayment` | booking, amount/currency/FX/base amount, method/reference/date/status, record/verify actors, optional invoice | Multiple partial customer payment-ins supported. |
| `SupplierPayment` | booking and required BookingSupplier; amount/currency/FX/base amount, method/reference/date/status, actors, optional invoice | Multiple partial supplier payment-outs supported. |
| `BookingAdjustment` | typed amount/currency/reason, creator and optional approver | Existing controlled fee/discount/refund/manual adjustment mechanism. |
| `CustomerInvoice` / `SupplierInvoice` | invoice workflow, amounts, currencies and optional document | Existing receivable/payable records. |
| `CustomerAdvance` / `SupplierAdvance` | advance balances and allocations | Closest current deposit/advance capability after booking, not a Sales deposit request/approval. |
| `Reconciliation` | one per Booking; seven verification booleans, status, actor/time, notes | Financial checklist and completion gate. |
| `ReconciliationDiscrepancy` | booking/reconciliation, type, description, optional amount/currency, status, assignment/resolution | Structured exception workflow. |

## Marketing, notification and audit

| Model | Role |
|---|---|
| `MarketingSalesSignal` | Typed Sales feedback with lead/customer links, priority and workflow status. |
| `MarketingAttribution` | Active/historical touch connecting campaign/deal/content/publication to required Lead/Customer and optional submission/booking; includes UTM medium/source/campaign/content and unique external-source reference. |
| `Notification` | User-owned persistent message with type, entity link, metadata and read state. |
| `AuditLog` | Actor/entity/action, sanitized before/after JSON, metadata, request IP/user-agent and timestamp. |

## Structural-equivalent check

| Proposed concept | Real structured equivalent now? | Closest existing structure |
|---|---|---|
| `SaleProduct` | No | Flat fields on `SaleSubmission` |
| `BookingProduct` | No | `BookingSupplier` plus booking-wide references/tasks/documents |
| `Quotation` | No | Lead status `QUOTING`; no quotation record/version/lines |
| `PaymentInstallment` | No | Multiple post-booking `PassengerPayment` records, but no schedule/obligation |
| `DepositRequest` | No | `SaleSubmission.depositAmount` and post-booking advances |
| `ManagementApproval` | No general equivalent | Admin sale acceptance and adjustment approval are workflow-specific |
| `ScheduleChange` | No | Booking date edits are audited, but no change event/entity |
| `PaymentEvidence` | No | Document metadata can be reused/linked only after a secure upload design |
| `CreditVoucher` | No | Adjustment/refund types do not represent voucher lifecycle/value balance |
| `PassengerSpecialRequest` | No | No passenger request/assistance model or field |
| `AdminVerificationChecklist` | No | Finance `Reconciliation` is not an Admin handover checklist |
| `SupplierPaymentDeadline` | No | Generic BookingTask due date only |
| `FreeCancellationDeadline` | No | Generic BookingTask due date only |
