# Frontend route inventory

All paths are Next.js App Router pages under `neo-tourism-erp/frontend/src/app`. Status reflects repository wiring and successful production compilation, not browser acceptance testing.

| URL | Page file | Module / purpose | APIs called (directly or by page component) | Permission(s) | Status |
|---|---|---|---|---|---|
| `/sales` | `sales/page.tsx` | Sales dashboard and links | `/leads/live`, `/leads/my`, `/follow-ups/summary` | `lead.view`; optional `followup.view`, `lead.attention.view` | WIRED |
| `/sales/submissions` | `sales/submissions/page.tsx` | Own submissions | `/sale-submissions/my` | `sale.view_own` | WIRED |
| `/sales/submissions/[id]` | `sales/submissions/[id]/page.tsx` | View/edit/submit Payment Card | GET/PATCH `/sale-submissions/:id`, POST `/:id/submit` | ownership plus `sale.edit_own`, `sale.submit` | WIRED |
| `/sales/offers` | `sales/offers/page.tsx` | Approved live Marketing deals | `/marketing/deals/sales/available` | `marketing.deal.sales_view` (navigation/backend) | WIRED |
| `/sales/offers/[id]` | `sales/offers/[id]/page.tsx` | Approved offer detail | `/marketing/deals/sales/available/:id` | `marketing.deal.sales_view` | WIRED |
| `/sales/marketing-signals` | `sales/marketing-signals/page.tsx` | Send Sales signal to Marketing | POST `/marketing/sales-signals` | `marketing.sales_signal.create` | WIRED |
| `/leads/live` | `leads/live/page.tsx` | Unassigned lead queue / claim | `/leads/live`, POST `/leads/:id/claim` | `lead.view`; claim requires `lead.assign` | WIRED |
| `/leads/pipeline` | `leads/pipeline/page.tsx` | Current user's pipeline | `/leads/my` | `lead.view` | WIRED |
| `/leads/attention` | `leads/attention/page.tsx` | Attention queue / reassignment | `/leads/attention`, `/users`, POST `/leads/:id/reassign` | `lead.attention.view`; optional `lead.reassign`, `user.view` | WIRED |
| `/leads/[id]` | `leads/[id]/page.tsx` | Lead workspace | GET/PATCH `/leads/:id`; status, notes, follow-ups, Sale Made and telephony endpoints | `lead.view` plus action permissions | WIRED |
| `/customers` | `customers/page.tsx` | Search/list customers | `/customers` | `customer.view` | WIRED |
| `/customers/new` | `customers/new/page.tsx` | Create customer | POST `/customers` | `customer.create` | WIRED |
| `/customers/[id]` | `customers/[id]/page.tsx` | Customer 360 and notes/edit/create-lead | GET/PATCH `/customers/:id`, notes endpoints, POST `/leads` | `customer.view`; action-specific permissions | WIRED |
| `/admin/sales` | `admin/sales/page.tsx` | New Sales queue | `/admin/sales-queue` | `admin.sale_queue.view` | WIRED |
| `/admin/sales/[id]` | `admin/sales/[id]/page.tsx` | Admin Payment Card review / accept / booking create | GET `/sale-submissions/:id`, POST accept, POST create-booking | service authorization plus `admin.sale.accept`, `booking.create` | WIRED; no reject action |
| `/operations` | `operations/page.tsx` | Lifecycle dashboard and Operations links | `/bookings/lifecycle-summary` | lifecycle component requires `booking.lifecycle.view` | WIRED |
| `/bookings` | `bookings/page.tsx` | Booking/folder list | `/bookings` | `booking.view` | WIRED |
| `/bookings/[id]` | `bookings/[id]/page.tsx` | Booking, lifecycle, operations and finance workspace | Booking detail/lifecycle/mutation APIs; `/users`; all booking-finance APIs | `booking.view` plus action/finance permissions | WIRED |
| `/accounts` | `accounts/page.tsx` | Finance dashboard/module links | `/accounts/summary` | `finance.view` for dashboard | WIRED |
| `/accounts/reconciliation` | `accounts/reconciliation/page.tsx` | Reconciliation queue | `/accounts/reconciliation-queue` | `finance.view` | WIRED |
| `/accounts/reconciled` | `accounts/reconciled/page.tsx` | Reconciled folders | `/accounts/reconciled` | `finance.view` | WIRED |
| `/accounts/discrepancies` | `accounts/discrepancies/page.tsx` | Open/assigned discrepancies | `/accounts/discrepancies` | `finance.view` | WIRED |
| `/accounts/accounting-controls` | `accounts/accounting-controls/page.tsx` | FX, tax, periods, audit reports | `/accounting/exchange-rates`, `/tax-codes`, `/periods`, chart and report endpoints | `fx.rate.*`, `tax.code.*`, `accounting.period.*`, report permissions | WIRED |
| `/accounts/banking` | `accounts/banking/page.tsx` | Bank accounts, transactions, statements/matching | `/banking/accounts/*`, transactions, transfers, statements and matching endpoints | `bank.account.*`, `bank.transaction.*`, `bank.reconciliation.*` | WIRED |
| `/accounts/chart-of-accounts` | `accounts/chart-of-accounts/page.tsx` | GL account/mapping management | `/accounting/chart-of-accounts`, `/accounting/mappings` | `gl.account.view/manage` | WIRED |
| `/accounts/general-ledger` | `accounts/general-ledger/page.tsx` | Posted ledger view | `/accounting/general-ledger` | `general-ledger.view` | WIRED |
| `/accounts/journals` | `accounts/journals/page.tsx` | Journal workflow | `/accounting/journals/*` and chart options | `journal.*`, `gl.account.view` | WIRED |
| `/accounts/reports` | `accounts/reports/page.tsx` | Financial reports | P&L, balance-sheet, cash-flow, ageing and audit report endpoints | relevant `report.*.view` | WIRED |
| `/accounts/trial-balance` | `accounts/trial-balance/page.tsx` | Trial balance | `/accounting/trial-balance` | `trial-balance.view` | WIRED |

## Notable frontend integration gaps

1. There is no Admin reject/return control because no matching backend action exists.
2. Booking documents submit a `storageKey` as metadata; no file chooser, multipart upload or secure download path is wired.
3. General `GET /leads`, Marketing attribution manual/list endpoints, Accounts receivables/payables list endpoints and several invoice/payment update/reversal endpoints have no dedicated page control, although some finance actions are available inside the booking workspace.
