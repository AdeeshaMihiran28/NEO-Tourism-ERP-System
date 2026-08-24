# HR launch foundation

Step 22 extends the existing Employee, User, Department, Role and Permission records. It does not create a separate HR datastore and does not delete or recreate existing HR data.

## Delivered scope

- Employment history, manager-cycle validation, database-driven organization chart, safe company directory, controlled custom fields, and atomic CSV import/export.
- Leave policies, employee policy assignments, decimal balances, annual/monthly accrual, manager-to-HR approvals, cancellation restoration, employee availability, and team calendar.
- Attendance summaries and potential overtime reporting. Overtime is reporting only; it does not calculate pay.
- Template-based onboarding/offboarding tasks, document requirements, internal acknowledgements, asset-return gates, exit interviews, ERP account deactivation, and audited role revocation.
- Employee self-service, direct-report manager views, HR dashboards/reports, document visibility/version/expiry, and access reviews driven by employment changes.

## Fixed business definitions

Turnover rate is `(employees terminated during the selected period / average of opening and closing active headcount) × 100`. A zero average headcount produces a zero rate. Changing this definition requires an explicit versioned product decision.

Potential overtime is actual worked duration beyond the assigned shift duration. It is informational attendance reporting and is not payroll, salary, tax, or overtime-pay processing.

Document acknowledgement records the employee, typed name, time, request IP, document version, and acknowledgement status. It is an internal V1 acknowledgement and is not represented as a certified third-party electronic signature.

## Privacy and access controls

The directory returns work identity and contact fields only. Personal email, personal phone, address, date of birth, emergency contacts, and private documents are excluded by the backend query. Document access is enforced by visibility and permissions at the API, not only hidden in the interface.

Employment changes create review records; they do not silently grant roles. Offboarding deactivates the linked User and removes active role assignments while preserving the User and historic business/audit records.

## Explicit exclusions

Payroll, compensation calculations, payslips, tax, benefits, expenses, performance cycles, goals/OKRs, recruitment/ATS, training, engagement surveys, predictive analytics, and native mobile applications remain outside this release.
