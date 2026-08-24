# IT UAT

Use UAT IT 1 for administration and UAT Employee 1 for self-service.

## I1 — Assets

1. As IT, open the seeded available UAT laptop or create another fictional laptop asset.
2. Assign it to UAT Employee 1 and confirm asset and employee history.
3. Return it with condition notes and confirm it becomes available.
4. Confirm Employee 1 does not gain IT asset administration.

## I2 — Ticket

1. As Employee 1, create an IT ticket and confirm it appears under own tickets.
2. As IT, review it, assign it, change status, and resolve with a clear resolution.
3. Confirm the employee receives updates and cannot read another employee's ticket.

The backend supports assignment and full status transitions, while the current frontend mainly exposes create/list/resolve. Record how the missing management controls affect real work.

## I3 — Access request

1. As Employee 1, create an access request for the fictional UAT Demo System.
2. As IT, approve or reject it with notes.
3. For an approved request, mark it fulfilled.
4. Confirm Employee 1 cannot approve/fulfil requests or access Audit/Management pages.

## Questions for IT

- Are asset types, tags, serial, warranty, condition, and assignment fields sufficient?
- Are ticket categories, priorities, statuses, assignment, and resolution correct?
- Does the access-request approval match the real process?
- What email/account/licence information must be tracked?
- What must happen during onboarding and offboarding?
- What IT work remains manual?
