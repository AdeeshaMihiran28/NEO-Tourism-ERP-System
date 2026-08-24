# Accounts UAT

Use UAT Accounts 1 and fictional amounts only.

## A1 — Payments and reconciliation

1. Open **Reconciliation Queue** and select a UAT folder.
2. Review selling price, supplier cost, fees, discounts, adjustments, received/paid totals, and expected profit.
3. Add a fictional Passenger Payment and verify it.
4. Add a fictional Supplier Payment and verify it.
5. Create a fee or discount adjustment and approve it through the permitted flow.
6. Confirm totals and profit recalculate correctly; independently calculate the expected result.
7. Start reconciliation and verify each required check.
8. Create a discrepancy, assign it, resolve it with notes, and confirm the audit/notification trail.
9. Mark the folder reconciled only after every prerequisite and discrepancy is complete.

Expected: Accounts can reconcile using ERP data without gaining Operations editing powers.

## A2 — Prepared states and negative checks

1. Open **Reconciliation Discrepancy**, resolve its fictional £25 supplier-cost mismatch, then retest completion.
2. Open **Travel Complete / Accounts Pending** and confirm the folder remains open.
3. Open **Fully Reconciled** and confirm reconciliation is visible while travel remains upcoming.
4. Open **Closed Folder** and confirm it is closed and protected.
5. Attempt early reconciliation completion or completion with an open discrepancy; both must be rejected clearly.

## A3 — Lifecycle rule

| Travel | Operations | Accounts | Expected folder |
|---|---|---|---|
| `TRAVEL_COMPLETE` | `COMPLETE` | `RECONCILED` | `CLOSED` |
| `TRAVEL_COMPLETE` | `COMPLETE` | `PENDING` | `OPEN` |

Confirm with Operations whether this is the real closing policy. Record disagreement as `BUSINESS RULE ISSUE`.

## Questions for Accounts

- Can a folder be reconciled using ERP information only?
- Are passenger payments, supplier costs, payment references, and statuses clear?
- Are fees, discounts, adjustments, and calculated profit understandable and correct?
- Are discrepancy types/reasons sufficient?
- Which information is still requested by email?
- Would you still need Excel, and why?
