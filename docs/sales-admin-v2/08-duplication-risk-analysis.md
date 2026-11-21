# Duplication risk analysis

## Reuse boundaries

| New idea | Existing feature at risk of duplication | Recommendation | Genuine new structure, if any |
|---|---|---|---|
| Booking products | `BookingSupplier` | Keep `Supplier` and `BookingSupplier` as supplier master/booking engagement. Associate them with a product; do not turn every supplier engagement into a duplicate product. | One explicit product aggregate is needed because itinerary/product identity, type and product state do not exist. |
| Product PNR/reference | `BookingReference` | Add an optional product relationship to the existing typed reference record. Do not add PNR/reference columns per product type. | Relation change only unless one reference must apply to multiple products. |
| Product documents/attachments | `BookingDocument` | Reuse its metadata, uploader, category and invoice relationships. | Secure upload/download storage boundary and optional product/payment/passenger links. |
| Payment evidence | `BookingDocument` and payment reference | Evidence should be a document linked to the existing payment, not a second payment or generic evidence ledger. | Payment-to-document relation and evidence category after storage exists. |
| Sales installments | `PassengerPayment`, customer advances | Treat installments as planned obligations; actual receipts remain `PassengerPayment`/advance allocations. Never copy paid amounts into a second receipt table. | Installment schedule may be new. |
| Sales deposit | `SaleSubmission.depositAmount`, `CustomerAdvance` | Keep requested amount on Sales context and book actual money through existing finance records. | Deposit request/approval state if management authorization is required. |
| Multiple payment methods | `PaymentMethod` on submission and each payment | Planned splits may have several methods; actual transactions continue to use current payments. | Planned payment allocation/installment children, not a new method enum. |
| Supplier payment obligations | `SupplierPayment`, SupplierInvoice, SupplierAdvance | Deadlines are obligations; payments remain actual ledger-affecting events. | Structured deadline/obligation only if a task cannot enforce business rules. |
| Revenue/cost/profit | `BookingFinance`, BookingSupplier cost, GL | Extend calculation/allocation to product detail while retaining BookingFinance as the authoritative booking summary and GL as accounting truth. | Product-level amounts/allocation fields. |
| Surcharges | `BookingAdjustment` / fees | Use controlled adjustments where a surcharge changes booking value. | Only add a product association/type semantics if required. |
| Credit vouchers | Refund adjustments | Do not label a refund adjustment as a voucher: vouchers have issue, remaining balance, expiry and redemption lifecycle. | A voucher entity is justified if the business really issues reusable credit. |
| Operational reminders | `BookingTask` | Add reminder behavior to tasks or schedule notifications from their due date. Do not add a second generic reminder table. | Specialized deadline fields/events where lifecycle rules depend on them. |
| Follow-up reminders | Lead `FollowUp` | Lead/customer follow-ups stay in CRM. Booking operational work stays in BookingTask; do not mix ownership/security scopes. | None unless cross-module reminders are explicitly required. |
| Admin verification | `Reconciliation` checklist | Keep Admin handover verification separate: reconciliation verifies finance after operational activity. Reuse UI/audit patterns, not the same row/booleans. | Admin checklist template/items/attestations if required. |
| Marketing communication | `MarketingSalesSignal` | Use the existing typed signal and status flow. Do not create “SalesMarketingMessage”. | Add types/links only when current fields cannot express a confirmed case. |
| Customer inquiry history | Leads and `LeadActivity` | Query existing leads/activities on Customer 360. Do not copy activities into CustomerNote or a new history table. | Read model/API only. |
| Booking history | Customer `bookings` | Extend the existing Customer 360 selection/pagination if necessary. | No new history entity. |
| Customer classification | `Customer.customerType` | Reuse NEW/REPEAT/REFERRAL. Do not create Marketing classification until “Marketing” is confirmed as a distinct class rather than medium/source. | Possibly an enum value after confirmation. |
| Updated lead stages | `LeadStatus` and activity history | Migrate/extend the current enum and existing transition endpoint. Do not add a parallel V2 status field. | Only new enum values and transition policy. |
| Schedule changes | Direct booking date update + AuditLog | AuditLog is generic evidence, not a queryable schedule history. Keep normal booking dates authoritative. | A schedule-change event is justified if acknowledgement/workflow is required. |
| Passenger requests | `Passenger` | Attach structured requests to the passenger and optionally product. Do not place free-text copies on Booking, task and supplier. | A request entity is justified for status/assignment/privacy. |

## Highest-risk duplication scenarios

1. **Building `BookingProduct` as a second supplier table.** A product answers “what the customer bought”; `BookingSupplier` answers “who supplies a service and at what cost.” Keep both roles explicit and related.
2. **Building a new finance subsystem inside Payment Card V2.** Planned installments/deposits must reconcile into the existing invoices, advances, payments, FX, GL and reconciliation services.
3. **Creating new attachment tables for every use.** Use one secure document store/metadata model with typed links for screenshots, tickets, confirmations and payment evidence.
4. **Using financial reconciliation as Admin verification.** These gates occur at different times, have different owners and attest different facts.
5. **Creating another Sales-to-Marketing channel.** `MarketingSalesSignal` already has sender, lead/customer, type, priority and triage status.

## Safe ownership rule

Each fact should have one authoritative record: product detail in the product aggregate; supplier engagement in `BookingSupplier`; identifiers in `BookingReference`; files in `BookingDocument`; actual money in finance transactions; accounting truth in posted GL; work in `BookingTask`; and communication in `MarketingSalesSignal`.
