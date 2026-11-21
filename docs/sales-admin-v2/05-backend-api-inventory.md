# Backend API inventory

All listed controllers use `JwtAuthGuard` and `PermissionsGuard`. “UI” means a current frontend call was found; “No” identifies an API not presently called by the frontend source. Dynamic IDs are UUID-validated.

## Customers — `CustomersController` -> `CustomersService`

| Method / route | Service method | Permission | Purpose | UI |
|---|---|---|---|---|
| GET `/customers` | `findAll` | `customer.view` | Search/filter/page customers | Yes |
| GET `/customers/:id` | `findOne` | `customer.view` | Customer 360 | Yes |
| POST `/customers` | `create` | `customer.create` | Create with duplicate warning | Yes |
| PATCH `/customers/:id` | `update` | `customer.edit` | Update profile/classification | Yes |
| GET `/customers/:id/notes` | `findNotes` | `customer.view` | List notes | Yes |
| POST `/customers/:id/notes` | `createNote` | `customer.view` + `customer.note.create` | Add attributed note | Yes |

## Leads — `LeadsController`

| Method / route | Service method | Permission | Purpose | UI |
|---|---|---|---|---|
| POST `/leads` | `LeadsService.create` | `lead.create` | Create customer-linked lead | Yes |
| GET `/leads/live` | `LeadsService.findLive` | `lead.view` | Unassigned oldest-first queue | Yes |
| GET `/leads/my` | `LeadsService.findMine` | `lead.view` | Agent pipeline | Yes |
| GET `/leads/attention` | `LeadsService.findAttention` | `lead.attention.view` | User/team attention queue | Yes |
| GET `/leads` | `LeadsService.findAll` | `lead.view_all` | All-lead manager query | No direct page |
| POST `/leads/:id/claim` | `LeadsService.claim` | `lead.assign` | Atomically claim lead | Yes |
| POST `/leads/:id/reassign` | `LeadsService.reassign` | `lead.reassign` | Reassign attention lead | Yes |
| POST `/leads/:id/sale-made` | `SalesService.startSaleMade` | `sale.create` | Create unique draft submission | Yes |
| PATCH `/leads/:id/status` | `LeadsService.updateStatus` | `lead.change_status` | Change lead stage | Yes |
| POST `/leads/:id/notes` | `LeadsService.createNote` | `lead.note.create` | Add activity-backed note | Yes |
| GET `/leads/:id` | `LeadsService.findOne` | `lead.view` | Lead workspace detail | Yes |
| PATCH `/leads/:id` | `LeadsService.update` | `lead.edit` | Edit approved fields | Yes |

## Follow-ups — `FollowUpsController` -> `FollowUpsService`

| Method / route | Service method | Permission | Purpose | UI |
|---|---|---|---|---|
| POST `/leads/:id/follow-ups` | `create` | `followup.create` | Schedule follow-up/callback | Yes |
| GET `/leads/:id/follow-ups` | `findForLead` | `followup.view` | Lead follow-ups | Yes |
| GET `/follow-ups/summary` | `getSummary` | `followup.view` | Due/missed dashboard counts | Yes |
| PATCH `/follow-ups/:id` | `update` | `followup.edit` | Reschedule/edit | Yes |
| POST `/follow-ups/:id/complete` | `complete` | `followup.complete` | Complete as meaningful activity | Yes |
| POST `/follow-ups/:id/cancel` | `cancel` | `followup.edit` | Cancel with reason | Yes |

## Sales submissions

`SalesSubmissionsController`/`AdminSalesController` -> `SalesService`.

| Method / route | Service method | Permission | Purpose | UI |
|---|---|---|---|---|
| GET `/sale-submissions/my` | `findMine` | `sale.view_own` | Own submissions | Yes |
| GET `/sale-submissions/:id` | `findOne` | no decorator; service enforces owner or privileged access | Submission detail | Yes |
| PATCH `/sale-submissions/:id` | `update` | `sale.edit_own` + service owner/draft check | Save Payment Card draft | Yes |
| POST `/sale-submissions/:id/submit` | `submit` | `sale.submit` + owner check | Submit to Admin | Yes |
| POST `/sale-submissions/:id/accept` | `accept` | `admin.sale.accept` | Accept submitted sale | Yes |
| GET `/admin/sales-queue` | `findAdminQueue` | `admin.sale_queue.view` | Submitted queue | Yes |

No reject/return endpoint exists.

## Bookings and Operations — `BookingsController`

| Method / route | Service method | Permission | Purpose | UI |
|---|---|---|---|---|
| GET `/bookings/lifecycle-summary` | `BookingLifecycleService.summary` | `booking.lifecycle.view` | Operations lifecycle counts | Yes |
| POST `/sale-submissions/:id/create-booking` | `BookingsService.createFromSale` | `booking.create` | Unique booking/folder from accepted sale | Yes |
| GET `/bookings` | `BookingsService.findAll` | `booking.view` | Booking list/filter | Yes |
| GET `/bookings/:id` | `BookingsService.findOne` | `booking.view` | Full booking workspace | Yes |
| GET `/bookings/:id/lifecycle` | `BookingLifecycleService.getLifecycle` | `booking.lifecycle.view` | Lifecycle state/readiness | Yes |
| POST `/bookings/:id/lifecycle/re-evaluate` | `evaluateBookingLifecycle` | `booking.lifecycle.manage` | Re-evaluate lifecycle | Yes |
| POST `/bookings/:id/operations/complete` | `completeOperations` | `booking.operations.complete` | Mark Operations complete | Yes |
| POST `/bookings/:id/reopen` | `reopen` | `booking.reopen` | Reopen closed folder with reason | Yes |
| PATCH `/bookings/:id` | `BookingsService.update` | `booking.edit` | Edit booking fields | Yes |
| POST `/bookings/:id/assign-operations` | `assignOperations` | `booking.assign_operations` | Assign Operations owner | Yes |
| PATCH `/bookings/:id/status` | `updateStatus` | `booking.status.manage` | Booking status | Yes |
| PATCH `/bookings/:id/operations-status` | `updateStatus` | `booking.status.manage` | Operations status | Yes |
| PATCH `/bookings/:id/travel-status` | `updateStatus` | `booking.status.manage` | Travel status | Yes |
| POST `/bookings/:id/passengers` | `addPassenger` | `booking.manage_passengers` | Add passenger | Yes |
| PATCH `/bookings/:id/passengers/:passengerId` | `updatePassenger` | `booking.manage_passengers` | Update passenger | Yes |
| POST `/bookings/:id/suppliers` | `addSupplier` | `booking.manage_suppliers` | Add supplier/relation | Yes |
| PATCH `/bookings/:id/suppliers/:bookingSupplierId` | `updateSupplier` | `booking.manage_suppliers` | Update booking supplier | Yes |
| POST `/bookings/:id/references` | `addReference` | `booking.manage_references` | Add PNR/ticket/other reference | Yes |
| PATCH `/bookings/:id/references/:referenceId` | `updateReference` | `booking.manage_references` | Update reference | Yes |
| POST `/bookings/:id/documents` | `addDocument` | `booking.manage_documents` | Store document metadata | Yes, metadata only |
| POST `/bookings/:id/notes` | `addNote` | `booking.manage_notes` | Add operational note | Yes |
| POST `/bookings/:id/tasks` | `addTask` | `booking.manage_tasks` | Add/assign task | Yes |
| PATCH `/bookings/:id/tasks/:taskId` | `updateTask` | `booking.manage_tasks` | Edit/status task | Yes |

## Accounts and reconciliation — `AccountsController` -> `BookingFinanceService`

| Method / route | Service method | Permission | Purpose | UI |
|---|---|---|---|---|
| GET `/accounts/reconciliation-queue` | `queue` | `finance.view` | Pending folders | Yes |
| GET `/accounts/summary` | `dashboard` | `finance.view` | Finance dashboard counts | Yes |
| GET `/accounts/receivables` | `receivables` | `finance.view` | Customer receivables | No dedicated page |
| GET `/accounts/payables` | `payables` | `finance.view` | Supplier payables | No dedicated page |
| GET `/accounts/reconciled` | `reconciled` | `finance.view` | Reconciled folders | Yes |
| GET `/accounts/booking-profitability` | `bookingProfitabilityReport` | `report.audit.view` | Booking profitability report | Yes |
| GET `/accounts/discrepancies` | `discrepancies` | `finance.view` | Discrepancy queue | Yes |
| GET `/bookings/:id/financial-summary` | `financialSummary` | `finance.view` | Booking totals/profit | Yes |
| GET/POST `/bookings/:id/customer-invoices` | `listCustomerInvoices` / `createCustomerInvoice` | `finance.view` / `finance.edit` | Customer invoices | Yes |
| PATCH `/customer-invoices/:id` | `updateCustomerInvoice` | `finance.edit` | Update invoice | No UI call found |
| POST `/customer-invoices/:id/cancel` | `cancelInvoice` | `finance.edit` | Cancel customer invoice | No UI call found |
| GET/POST `/bookings/:id/supplier-invoices` | `listSupplierInvoices` / `createSupplierInvoice` | `finance.view` / `finance.edit` | Supplier invoices | Yes |
| PATCH `/supplier-invoices/:id` | `updateSupplierInvoice` | `finance.edit` | Update supplier invoice | No UI call found |
| POST `/supplier-invoices/:id/cancel` | `cancelInvoice` | `finance.edit` | Cancel supplier invoice | No UI call found |
| GET/POST `/bookings/:id/customer-advances` | `listCustomerAdvances` / `createCustomerAdvance` | `finance.view` / `finance.edit` | Customer advances | Yes |
| POST `/customer-advances/:id/allocations` | `allocateAdvance` | `finance.edit` | Allocate customer advance | Yes |
| POST `/customer-advance-allocations/:id/reverse` | `reverseAllocation` | `finance.edit` | Reverse allocation | No UI call found |
| GET/POST `/bookings/:id/supplier-advances` | `listSupplierAdvances` / `createSupplierAdvance` | `finance.view` / `finance.edit` | Supplier advances | Yes |
| POST `/supplier-advances/:id/allocations` | `allocateAdvance` | `finance.edit` | Allocate supplier advance | Yes |
| POST `/supplier-advance-allocations/:id/reverse` | `reverseAllocation` | `finance.edit` | Reverse allocation | No UI call found |
| GET `/bookings/:id/reconciliation` | `getReconciliation` | `finance.view` | Reconciliation detail | Yes |
| POST `/bookings/:id/reconciliation/start` | `start` | `finance.reconcile` | Start review | Yes |
| PATCH `/bookings/:id/reconciliation` | `updateReconciliation` | `finance.reconcile` | Update checklist/notes | Yes |
| POST `/bookings/:id/reconciliation/complete` | `complete` | `finance.reconcile` | Complete and lifecycle-evaluate | Yes |
| POST `/bookings/:id/reconciliation/discrepancies` | `createDiscrepancy` | `finance.discrepancy.manage` | Create discrepancy | Yes |
| POST `/reconciliation-discrepancies/:id/resolve` | `resolveDiscrepancy` | `finance.discrepancy.manage` | Resolve discrepancy | Yes |
| GET/POST `/bookings/:id/passenger-payments` | `listPassengerPayments` / `createPassengerPayment` | `finance.view` / `finance.payment.create` | Payment-in | Yes |
| PATCH `/passenger-payments/:id` | `updatePassengerPayment` | `finance.payment.create` | Update pending payment | Yes |
| POST `/passenger-payments/:id/verify` | `verifyPassengerPayment` | `finance.payment.verify` | Verify payment-in | Yes |
| POST `/passenger-payments/:id/reverse` | `reversePayment` | `finance.payment.verify` | Reverse payment-in | No UI call found |
| GET/POST `/bookings/:id/supplier-payments` | `listSupplierPayments` / `createSupplierPayment` | `finance.view` / `finance.payment.create` | Payment-out | Yes |
| PATCH `/supplier-payments/:id` | `updateSupplierPayment` | `finance.payment.create` | Update pending payment | Yes |
| POST `/supplier-payments/:id/verify` | `verifySupplierPayment` | `finance.payment.verify` | Verify payment-out | Yes |
| POST `/supplier-payments/:id/reverse` | `reversePayment` | `finance.payment.verify` | Reverse payment-out | No UI call found |
| GET/POST `/bookings/:id/adjustments` | `listAdjustments` / `createAdjustment` | `finance.view` / `finance.adjustment.create` | Fees/discounts/refunds/adjustments | Yes |
| POST `/booking-adjustments/:id/approve` | `approveAdjustment` | `finance.adjustment.approve` | Approve adjustment | Yes |

## Marketing Signals and attribution

| Method / route | Controller -> service | Permission | Purpose | UI |
|---|---|---|---|---|
| GET `/marketing/pulse` | `PulseController` -> `PulseService.get` | `marketing.pulse.view` | Marketing command dashboard | Yes |
| POST `/marketing/sales-signals` | `PulseController` -> `SalesSignalsService.create` | `marketing.sales_signal.create` | Sales-to-Marketing signal | Yes |
| GET `/marketing/sales-signals` | `PulseController` -> `SalesSignalsService.list` | `marketing.sales_signal.view` | Filter signals | Indirectly in Pulse aggregate; no standalone call found |
| PATCH `/marketing/sales-signals/:id` | `PulseController` -> `SalesSignalsService.update` | `marketing.sales_signal.manage` | Triage/manage signal | Yes |
| GET `/marketing/signal` | `SignalController` -> `SignalService.get` | `marketing.signal.view` | Performance signal | Yes |
| GET `/marketing/signal/management` | `SignalController` -> `SignalService.management` | `marketing.signal.management` | Management detail | Yes |
| POST `/marketing/attribution/manual` | `SignalController` -> `AttributionService.manual` | `marketing.attribution.manage` | Manual attribution/override | No frontend call found |
| GET `/marketing/attribution/lead/:leadId` | `SignalController` -> `AttributionService.listForLead` | `marketing.attribution.view` | Lead attribution history | No frontend call found |

## Backend-only opportunities

The clearest reusable backend-only surfaces are all-lead management query, attribution management/history, receivables/payables views, and finance update/cancel/reversal actions. V2 should connect these where required rather than duplicate them.
