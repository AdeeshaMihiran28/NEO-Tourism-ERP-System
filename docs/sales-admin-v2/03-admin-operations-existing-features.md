# Admin Operations existing features

| # | Feature | Classification | Evidence / limitation |
|---:|---|---|---|
| 1 | Admin New Sales queue | FULLY IMPLEMENTED | Permission-protected oldest-first submitted queue and UI. |
| 2 | Payment Card review | FULLY IMPLEMENTED | Admin detail uses the shared read-only submission card. |
| 3 | Admin accept | FULLY IMPLEMENTED | Atomic accept, activity, audit and advisor notification. |
| 4 | Admin reject/return workflow | NOT IMPLEMENTED | `ADMIN_REJECTED` exists in the enum only; no controller, service action or UI. |
| 5 | Booking creation from Sale Submission | FULLY IMPLEMENTED | Requires accepted submission; copies customer/lead/sales data and prevents duplicates. |
| 6 | Folder-number generation | FULLY IMPLEMENTED | Transactional yearly `FolderCounter`, unique booking field and concurrency E2E test. |
| 7 | Booking folder | FULLY IMPLEMENTED | List/detail workspace with linked customer, lead, sale and operational/finance children. |
| 8 | Operations owner assignment | FULLY IMPLEMENTED | Permissioned action, user selection, notification and audit. |
| 9 | Passenger management | FULLY IMPLEMENTED | Add/update passengers; sensitive passport masking is permission-aware. |
| 10 | Additional passengers | FULLY IMPLEMENTED | Booking has a one-to-many passenger relation and UI supports repeated additions. |
| 11 | Supplier management | FULLY IMPLEMENTED | Supplier details and booking relationship can be created/updated in the booking workspace. |
| 12 | BookingSupplier relationships | FULLY IMPLEMENTED | Supplier, service type, reference, cost, currency, status and notes are structured. |
| 13 | PNR/references | FULLY IMPLEMENTED | Structured reference records with optional supplier link. |
| 14 | Ticket references | FULLY IMPLEMENTED | `TICKET_NUMBER` is a supported booking reference type. |
| 15 | Booking documents | PARTIALLY IMPLEMENTED | Metadata model/API/UI records name, type, storage key and category. No repository-owned upload/download transport is present. |
| 16 | Actual file upload capability | NOT IMPLEMENTED | Endpoint accepts JSON metadata; no multipart handler, object-storage adapter or binary persistence. |
| 17 | Notes | FULLY IMPLEMENTED | Booking notes with actor/time, permission and audit. |
| 18 | Tasks | FULLY IMPLEMENTED | Add/update/status/due date and booking-scoped display. |
| 19 | Employee task assignment | FULLY IMPLEMENTED | Optional assigned user, assignment notification, indexes and UI. |
| 20 | Booking statuses | FULLY IMPLEMENTED | Structured status enum and protected transition action. |
| 21 | Operations statuses | FULLY IMPLEMENTED | Includes pending/in-progress/supplier/ticketing/ready/complete/action-required. |
| 22 | Travel statuses | FULLY IMPLEMENTED | Upcoming/in-travel/complete/cancelled with scheduled lifecycle evaluation. |
| 23 | Accounts statuses | FULLY IMPLEMENTED | Not started, reconciliation pending, reconciled and discrepancy; finance service owns transitions. |
| 24 | Folder lifecycle | FULLY IMPLEMENTED | Summary/detail/re-evaluate endpoints, scheduled evaluation and notifications. |
| 25 | Folder closing | FULLY IMPLEMENTED | Closes only after travel, Operations and Accounts are complete; tested. |
| 26 | Folder reopening | FULLY IMPLEMENTED | Dedicated permission and required reason; audit and re-evaluation. |
| 27 | Customer Payment-In | FULLY IMPLEMENTED | Partial/multiple passenger payments with method, currency, FX/base amount, verification and reversal. |
| 28 | Supplier Payment-Out | FULLY IMPLEMENTED | BookingSupplier-linked partial/multiple payments with verification and reversal. |
| 29 | Multiple currencies | FULLY IMPLEMENTED | Booking, supplier and payment currency fields plus stored exchange/base amounts. |
| 30 | Finance/profit information | FULLY IMPLEMENTED | Selling price, supplier cost, fees, discounts, adjustments, revenue and profit summaries. |
| 31 | Reconciliation | FULLY IMPLEMENTED | Start/checklist/update/complete workflow, permissions, audit and close integration. |
| 32 | Discrepancy handling | FULLY IMPLEMENTED | Structured discrepancies with assignment, resolution, amount/currency and guarded completion. |

## Counts

- Fully implemented: **29**
- Partially implemented: **1**
- Missing/not implemented: **2**
