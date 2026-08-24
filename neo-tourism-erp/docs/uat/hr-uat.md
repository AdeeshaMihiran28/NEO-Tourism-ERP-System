# HR UAT

Use UAT HR 1 for administration and UAT Employee 1 for self-service. Sign out fully between roles.

## H1 — Employee and attendance

1. As HR, find UAT Employee 1 and review employee number, account link, department, title, employment type/status, join date, and contact fields.
2. Create another clearly fictional employee and link an approved test account if available.
3. As Employee 1, check in and check out. Confirm duplicate check-in or checkout is rejected clearly.
4. As HR, review and correct attendance using an explanatory note.
5. Confirm Employee 1 cannot open another employee's private record.

## H2 — Leave

1. As Employee 1, create a future leave request and view own requests.
2. As HR, review and approve or reject it with notes.
3. Confirm the employee sees the result and notification.
4. Confirm Employee 1 cannot approve leave or view all employee requests.

## H3 — HR lifecycle and documents

Review the seeded contract metadata and discuss required document categories, storage, access, retention, onboarding checks, offboarding checks, and account/device handover. The backend foundations exist, but document and onboarding/offboarding administration are not complete UI workflows; record any operational blocker as `MISSING REQUIREMENT` or `UX ISSUE`.

## Questions for HR

- Are employee fields sufficient?
- Is attendance simple enough and who may correct it?
- Are leave types/statuses correct, and is manager approval required before HR?
- What documents must be stored and who may see them?
- Which onboarding/offboarding checks are mandatory?
- Which HR reports are missing?
- What current Excel/email work should move into the ERP?
