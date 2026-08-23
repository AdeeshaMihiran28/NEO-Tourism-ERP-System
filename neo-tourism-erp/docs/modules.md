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
| HR | Employees, attendance, shifts, leave, employee documents and offboarding | HR / employee self-service |
| IT | Assets, assignments, tickets and access requests | IT / employee self-service |
| Audit / Notifications | Immutable activity evidence and user alerts | Authorized auditors / recipients |
| Dashboards | Role-specific management, Sales, Operations, Accounts, HR and IT summaries | Permission controlled |
| Integrations | Safe status, website webhook, Wise and PBX adapter foundations | IT / Admin |

External provider actions remain disabled until credentials and provider-specific acceptance tests are completed. No generic outbound call silently falls back to mock success.
