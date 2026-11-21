# New requirement gap matrix

Status values describe the current repository. “Reuse” means reuse the named aggregate/service; it does not imply overloading it with a different business meaning.

## Sales requirements

| Requirement | Existing Component | Existing Status | Reuse? | Modify? | New Development? | Business Rule Confirmation Needed? | Risk / Notes |
|---|---|---|:---:|:---:|:---:|:---:|---|
| Marketing Medium | `Lead.source`, `MarketingAttribution.utmMedium` | PARTIALLY COVERED | Yes | Yes | No | Yes | Decide controlled values and source-vs-medium distinction. |
| Updated Lead statuses | `LeadStatus`, status service/UI | ALREADY COVERED structurally | Yes | Yes | No | Yes | Migration/transition mapping must be explicit. |
| Improved Lead Workspace | Existing lead page/service | PARTIALLY COVERED | Yes | Yes | No | Yes | Extend current page; do not make a second workspace. |
| Complete customer inquiry history | Lead relation/activity; Customer 360 returns only lead count | PARTIALLY COVERED | Yes | Yes | No | No | Add scoped history query/view without duplicating activities. |
| Complete booking history | Customer 360 `bookings` | ALREADY COVERED | Yes | No | No | No | Existing response includes lifecycle states and dates. |
| Marketing/New, Repeat, Referral classification | `CustomerType` | ALREADY COVERED | Yes | No | No | Yes | Confirm whether “Marketing” is a fourth class or a medium; current values are New/Repeat/Referral. |
| Admin-only primary email editing | Customer update + `customer.edit` | NEEDS MODIFICATION | Yes | Yes | No | Yes | Current permission permits all customer fields. Split field authority server-side. |
| Admin-only primary phone editing | Customer update + `customer.edit` | NEEDS MODIFICATION | Yes | Yes | No | Yes | Same field-level authorization gap. |
| Quotation management | Lead `QUOTING` status only | COMPLETELY NEW | No | No | Yes | Yes | Define versions, validity, products, currency and acceptance. |
| Future booking management | `travelDate`, `TRAVEL_IN_FUTURE`, follow-ups | PARTIALLY COVERED | Yes | Yes | Maybe | Yes | A dedicated queue/reminder policy is absent. |
| Payment Card V2 | `SaleSubmission` V1 | NEEDS MODIFICATION | Yes | Yes | Yes | Yes | Preserve one submission per lead while adding child detail. |
| Multiple booking products | None | COMPLETELY NEW | Yes | Yes | Yes | Yes | Requires a single product aggregate carried into Booking. |
| International Flights | Supplier/reference types only | PARTIALLY COVERED | Yes | Yes | Yes | Yes | No Sale/Booking product record. |
| Budget Carriers | Supplier/reference types only | PARTIALLY COVERED | Yes | Yes | Yes | Yes | Define whether subtype or product type. |
| Hotels | Hotel supplier/reference types | PARTIALLY COVERED | Yes | Yes | Yes | Yes | BookingSupplier is not a product. |
| Transfers | Transfer supplier type | PARTIALLY COVERED | Yes | Yes | Yes | Yes | Same product gap. |
| Tours | Tour-operator supplier type | PARTIALLY COVERED | Yes | Yes | Yes | Yes | Same product gap. |
| Supplier information per product | `Supplier`, `BookingSupplier` | PARTIALLY COVERED | Yes | Yes | Yes | Yes | Product-to-supplier cardinality must be decided. |
| PNR/reference per product | `BookingReference` (booking-wide) | PARTIALLY COVERED | Yes | Yes | Maybe | Yes | Add product association; avoid parallel PNR strings. |
| Screenshot upload | `BookingDocument` metadata only | COMPLETELY NEW | Yes | Yes | Yes | Yes | Needs authorized storage/upload/download and retention rules. |
| Clipboard screenshot paste | None | COMPLETELY NEW | Yes | Yes | Yes | Yes | Build only after secure upload transport. |
| Multiple payment methods | One method on submission; many booking payments | PARTIALLY COVERED | Yes | Yes | Yes | Yes | Separate planned split from actual receipts. |
| Installment payments | Multiple receipts, no schedule | COMPLETELY NEW | Yes | Yes | Yes | Yes | Define due dates, amounts, state and allocation. |
| Deposit requests | Flat `depositAmount`; advances after booking | COMPLETELY NEW | Yes | Yes | Yes | Yes | A requested deposit is not a received advance. |
| Management deposit approvals | No deposit approval | COMPLETELY NEW | Yes | Yes | Yes | Yes | Reuse approval/audit patterns, not adjustment approval rows. |
| Sales submission | `SaleSubmission` workflow | ALREADY COVERED | Yes | No | No | No | Extend rather than replace. |
| Admin handover | submit/accept/create-booking | ALREADY COVERED | Yes | Yes | No | Yes | Reject/return/resubmit is missing. |
| Marketing Signals | `MarketingSalesSignal` | ALREADY COVERED | Yes | No | No | No | Do not create another communication table. |

## Operations requirements

| Requirement | Existing Component | Existing Status | Reuse? | Modify? | New Development? | Business Rule Confirmation Needed? | Risk / Notes |
|---|---|---|:---:|:---:|:---:|:---:|---|
| Product-level management | No Booking product | COMPLETELY NEW | Yes | Yes | Yes | Yes | Must align with Sales product handover. |
| Product-level status | Booking/Operations/Supplier statuses only | COMPLETELY NEW | Yes | Yes | Yes | Yes | Define states per product type. |
| Additional products | No product entity | COMPLETELY NEW | Yes | Yes | Yes | Yes | Clarify post-acceptance price/approval effects. |
| Product supplier assignment | `BookingSupplier` | PARTIALLY COVERED | Yes | Yes | Maybe | Yes | Associate existing relation with product; do not duplicate supplier master. |
| Individual PNR/reference | `BookingReference` | PARTIALLY COVERED | Yes | Yes | Maybe | Yes | Add product association. |
| Schedule changes | Booking date edit/audit only | COMPLETELY NEW | Yes | Yes | Yes | Yes | Need old/new schedule, actor, reason and notifications. |
| Follow-up reminders | `BookingTask.dueAt` | PARTIALLY COVERED | Yes | Yes | Maybe | Yes | Task has no scheduled reminder engine. |
| Supplier pending | `OperationsStatus.SUPPLIER_PENDING`, supplier status | ALREADY COVERED | Yes | Maybe | No | Yes | Product granularity may require extension. |
| Ticket issuance | Ticket reference/document and `TICKETING_PENDING` | PARTIALLY COVERED | Yes | Yes | Maybe | Yes | No issued-at/by/product state. |
| Revenue | `BookingFinance.expectedRevenue` | PARTIALLY COVERED | Yes | Yes | Maybe | Yes | Booking-level only. |
| Surcharge | Fees/adjustments | PARTIALLY COVERED | Yes | Yes | Maybe | Yes | Define whether customer charge, supplier cost or both. |
| Cost of sale | Booking/supplier costs | PARTIALLY COVERED | Yes | Yes | Maybe | Yes | Product-level allocation absent. |
| Profit | `BookingFinance.expectedProfit` | PARTIALLY COVERED | Yes | Yes | Maybe | Yes | Product-level profit absent. |
| Customer payment-in | `PassengerPayment` | ALREADY COVERED | Yes | Maybe | No | Yes | Naming may need broader customer semantics. |
| Supplier payment-out | `SupplierPayment` | ALREADY COVERED | Yes | Maybe | No | No | Already BookingSupplier-linked. |
| Supplier payment multiple currencies | Currency/FX/base fields | ALREADY COVERED | Yes | No | No | No | Existing accounting controls apply. |
| Payment evidence | Document metadata only | COMPLETELY NEW | Yes | Yes | Yes | Yes | Needs secure upload and payment linkage. |
| Credit vouchers | Adjustment/refund only | COMPLETELY NEW | Yes | Yes | Yes | Yes | Define issuer, balance, expiry, redemption and accounting. |
| Supplier payment deadline | Generic task due date | COMPLETELY NEW | Yes | Yes | Yes | Yes | Deadline should be structured if it drives finance/lifecycle. |
| Free cancellation deadline | Generic task due date | COMPLETELY NEW | Yes | Yes | Yes | Yes | Time zone and consequences must be defined. |
| Operational notes | `BookingNote` | ALREADY COVERED | Yes | No | No | No | Use existing record. |
| Tasks | `BookingTask` | ALREADY COVERED | Yes | Maybe | No | No | Extend only for reminder behavior. |
| Employee assignment | Operations owner/task assignee | ALREADY COVERED | Yes | No | No | Yes | Confirm product-level assignment need. |
| Passenger special assistance | No structured field/model | COMPLETELY NEW | Yes | Yes | Yes | Yes | Sensitive data/access/retention need definition. |
| Passenger special requests | No structured field/model | COMPLETELY NEW | Yes | Yes | Yes | Yes | Decide passenger-product association. |
| Admin verification checklist | Finance checklist only | COMPLETELY NEW | No | No | Yes | Yes | Do not overload reconciliation; ownership/policy differ. |
| Confirmations | Supplier status/references/documents | PARTIALLY COVERED | Yes | Yes | Maybe | Yes | Define what constitutes confirmed and evidence required. |
| E-tickets | Ticket reference + document metadata | PARTIALLY COVERED | Yes | Yes | Yes | Yes | Actual file transport absent. |
| Attachments | `BookingDocument` metadata | PARTIALLY COVERED | Yes | Yes | Yes | Yes | Secure storage is the missing boundary. |
| Reconciliation information | `Reconciliation` and discrepancies | ALREADY COVERED | Yes | Maybe | No | Yes | Add product detail only if finance requires it. |

## Highest-priority structural gaps

1. A single product structure shared by Sales handover and Booking Operations.
2. Admin reject/return/resubmit state transitions.
3. Secure attachment upload/download and evidence linkage.
4. Planned installments/deposit request/approval distinct from actual payment records.
5. Product-level deadlines, schedule changes and passenger requirements.
