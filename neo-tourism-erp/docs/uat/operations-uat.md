# Admin / Operations UAT

Use UAT Operations 1. Begin after Sales has submitted Scenario S1, or use an existing submitted UAT sale.

## O1 — Sales handover to booking

1. Open **New Sales** and review the submitted Payment Card.
2. Confirm customer, destination, travel dates, selling price/deposit, payment reference, and Sales notes arrived from Sales.
3. Accept the sale once and create the Booking.
4. Confirm a unique Folder Number appears and a second booking cannot be created from the same submission.
5. Assign UAT Operations 1 as Operations owner.
6. Add a fictional passenger. Never enter a real passport number.
7. Add a PNR/reference, supplier, supplier reference, and supplier cost.
8. Add an operational note and a task; complete the task.
9. Move Operations through appropriate statuses and check Notifications/Audit.

Expected flow:

```text
Sales Submission → New Sales → Review → Accept → Create Folder → Booking
```

## O2 — Prepared booking states

Open and review each seeded folder:

- New Booking
- Operations In Progress
- Supplier Pending
- Travel Upcoming
- Travel Complete / Accounts Pending
- Reconciliation Discrepancy
- Fully Reconciled
- Closed Folder

Confirm lists, filters, status labels, ownership, next action, and closed-folder protection are understandable. Try an unauthorized finance page: Operations may enter supplier cost but must not receive Accounts visibility or reconciliation powers.

## O3 — Lifecycle handover

1. Use a UAT booking with completed travel.
2. Confirm `Travel = TRAVEL_COMPLETE` and `Operations = COMPLETE` do not close it while `Accounts = PENDING`.
3. Coordinate with Accounts to reconcile a prepared record.
4. Confirm closure happens only after all three conditions are complete.
5. Confirm reopening requires an authorized role and a reason.

## Questions for Operations

- Is Sales information complete, or are you typing it again?
- Is Folder Number clear and searchable?
- Are passenger, supplier, PNR, reference, task, and status fields sufficient?
- Do you need more operational statuses?
- Are notifications useful and sent to the right people?
- What still requires email, WhatsApp, or Excel?
- Does folder closing match the real policy?

Known UAT limitation: supplier correction is API-only and documents are metadata/URL records. Record the business impact rather than using real documents.
