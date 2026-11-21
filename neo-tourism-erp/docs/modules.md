# Module inventory

| Module | Responsibility | Primary access |
|---|---|---|
| Auth / Users / RBAC | Login, user lifecycle, departments, roles, effective permissions | Admin / Management |
| Customer 360 | Customer profile, notes, duplicate warning, booking and lead history | Sales / authorized staff |
| Leads / Follow-ups | Live leads, claiming, pipeline, callbacks, attention and reassignment | Sales / Management |
| Sales handover | Sale Made payment card, submission, Admin acceptance | Sales / Operations |
| Bookings / Operations | Folder creation, passenger, suppliers, references, documents, notes and tasks | Operations |
| Accounts | Payments, verification, adjustments, discrepancies and reconciliation | Accounts |
| Lifecycle | Travel state evaluation, Operations completion, folder closure/reopen | Operations / Accounts / Management |
| HR | Employees, history, org chart/directory, attendance, leave balances and approvals, documents, onboarding/offboarding, self-service, reporting and access reviews | HR / managers / employee self-service |
| IT | Assets, assignments, tickets and access requests | IT / employee self-service |
| Audit / Notifications | Immutable activity evidence and user alerts | Authorized auditors / recipients |
| Dashboards | Role-specific management, Sales, Operations, Accounts, HR and IT summaries | Permission controlled |
| Integrations | Safe status, website webhook, Wise and PBX adapter foundations | IT / Admin |
| Marketing / NEO LAUNCH | Deal Cards, approval, scheduling, lifecycle, channels, website publishing adapter, and Sales Approved Offers | Marketing / Marketing managers / Sales read-only |
| Marketing / NEO FLOW + GREENLIGHT | Campaign foundation, visual content board, immutable versions, creative approvals, comments, workload/deadline signals and Deal-change review | Marketing creators / Marketing managers / explicitly authorized management |
| Marketing / NEO PLAN | Day/week/month calendar projections, manual planning, controlled rescheduling, useful alerts and Meta sync foundation | Marketing / Marketing managers / integration administrators |
| Marketing / NEO PULSE | Live command dashboard, attention/approval summaries, deterministic CRM trends, Sales signals, workload and upcoming activity | Marketing / Marketing managers; Sales signal submission only |
| Marketing / NEO SIGNAL | Explicit Campaign/Content/Deal attribution, funnel conversion, attribution coverage, rankings and selling-value contribution | Marketing / permission-controlled management detail |
| Marketing / NEO RADAR | Deterministic demand trends, Deal interest, existing Sales signals and human-controlled opportunity actions | Marketing / Marketing managers |
| Marketing / NEO STUDIO | NeoTrio ideas, character vault, controlled production, Flow/Greenlight/Plan integration, published library and attribution-backed performance | Marketing creators / Marketing managers / explicitly authorized viewers |

External provider actions remain disabled until credentials and provider-specific acceptance tests are completed. No generic outbound call silently falls back to mock success.
