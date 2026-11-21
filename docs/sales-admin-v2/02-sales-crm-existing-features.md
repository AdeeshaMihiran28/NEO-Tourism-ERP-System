# Sales & CRM existing features

Classification is based on schema, controller, service, frontend and test evidence in the current working tree.

| # | Feature | Classification | Evidence / limitation |
|---:|---|---|---|
| 1 | Customer management | FULLY IMPLEMENTED | List/search/page, create, detail, update, duplicate warning, notes, RBAC and audit exist. |
| 2 | Customer 360 | FULLY IMPLEMENTED | Profile returns customer, recent notes, full booking history and summary metrics; lifecycle E2E coverage exists. It exposes only a lead count, not complete inquiry rows. |
| 3 | Customer classifications | FULLY IMPLEMENTED | `CustomerType`: `NEW`, `REPEAT`, `REFERRAL`; stored, editable and filterable. Lifecycle can promote repeat customers. |
| 4 | Lead creation | FULLY IMPLEMENTED | Customer-linked creation, validation, activity and audit. |
| 5 | Lead sources | PARTIALLY IMPLEMENTED | `Lead.source` exists and is accepted, but it is free text; there is no structured Marketing Medium taxonomy. |
| 6 | Live New Leads | FULLY IMPLEMENTED | Oldest-first unassigned queue, frontend polling and tested concurrent access. |
| 7 | Take Lead / claiming | FULLY IMPLEMENTED | Permission protected, atomic `updateMany`, concurrent-claim test, activity, audit and notification. |
| 8 | My Pipeline | FULLY IMPLEMENTED | Agent-scoped route with status/search/page filters and UI. |
| 9 | Lead statuses | FULLY IMPLEMENTED | Eleven structured statuses, transition endpoint/UI and activity/audit history. New V2 wording still needs confirmation. |
| 10 | Lead workspace | FULLY IMPLEMENTED | Detail/edit/status, customer link, activities, notes, follow-ups, call action and Sale Made entry. |
| 11 | Lead notes | FULLY IMPLEMENTED | Notes are immutable `LeadActivity` records with actor/time, audit and attention refresh. |
| 12 | Lead activity history | FULLY IMPLEMENTED | Structured `LeadActivityType`, chronological detail response and transactional writes. |
| 13 | Follow-ups | FULLY IMPLEMENTED | Create/list/update/complete/cancel, ownership enforcement, audit, next action and scheduled notifications. |
| 14 | Callbacks | FULLY IMPLEMENTED | `CALLBACK` follow-up type, due/missed processing, summary and tests. |
| 15 | Attention-required logic | FULLY IMPLEMENTED | No activity, missed callback and no future action rules; hourly evaluation, deduplicated notices and tests. |
| 16 | Manager reassignment | FULLY IMPLEMENTED | Attention-only reassignment, manager restrictions, follow-up reassignment, notification and audit. |
| 17 | Future-travel leads | PARTIALLY IMPLEMENTED | `travelDate` and `TRAVEL_IN_FUTURE` exist, but there is no dedicated future-booking queue/reminder workflow. |
| 18 | Sale Made workflow | FULLY IMPLEMENTED | Creates one pre-populated draft per owned active lead, transactionally, with unique enforcement and audit. |
| 19 | Payment Card | FULLY IMPLEMENTED | Current V1 card has dates, destination, selling price, deposit, currency, payment method/reference and notes with completeness checks. It is not V2/productized. |
| 20 | Save Draft | FULLY IMPLEMENTED | Owner can update only `DRAFT`; frontend Save Draft and audited backend update exist. |
| 21 | Sales Submissions | FULLY IMPLEMENTED | Owner list/detail, status filtering and ownership enforcement. |
| 22 | Submit to Admin | FULLY IMPLEMENTED | Atomic state change, completeness checks, lead closure, activity, audit and oldest-first Admin queue. |
| 23 | Admin notifications | FULLY IMPLEMENTED | All active users holding `admin.sale_queue.view` receive persistent `NEW_SALE` notifications in the submission transaction. |
| 24 | Marketing Signals | FULLY IMPLEMENTED | Sales submission form, structured model, Marketing list/manage flow, permissions and audit. |
| 25 | Marketing attribution/integration | FULLY IMPLEMENTED | Attribution connects lead/customer to campaign/deal/content/publication and later submission/booking; UTM/manual/website paths and E2E coverage exist. |

## Counts

- Fully implemented: **23**
- Partially implemented: **2**
- Missing (frontend-only, backend-only, database-only, placeholder, dummy-dependent, not implemented, or unverified): **0**

“Fully implemented” means the current repository has an end-to-end implementation for its present scope; it does not mean the V2 extension is already covered.
