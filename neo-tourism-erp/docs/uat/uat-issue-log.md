# UAT issue log

Use the next unused `UAT-###` identifier. Do not identify an issue only by its description.

| ID | Date | Department | Module | Type | Priority | Description | Status | Assigned | Resolution / decision | Retest |
|---|---|---|---|---|---|---|---|---|---|---|
| UAT-001 |  |  |  |  |  |  | NEW |  |  | NOT TESTED |
| UAT-002 |  |  |  |  |  |  | NEW |  |  | NOT TESTED |
| UAT-003 |  |  |  |  |  |  | NEW |  |  | NOT TESTED |

## Status definitions

- `NEW`: reported but not reviewed.
- `TRIAGED`: type, priority, owner, and next decision confirmed.
- `IN_PROGRESS`: implementation or business decision is underway.
- `READY_FOR_RETEST`: developer and regression checks passed; return it to the tester.
- `CLOSED`: expected behavior was successfully retested or acceptance was formally verified.
- `DEFERRED`: not planned now; include owner, reason, risk, and review date.

Do not move directly from `IN_PROGRESS` to `CLOSED` merely because code changed.

## Triage rule

- A bug breaks an agreed behavior and may be fixed during UAT.
- A requested workflow change must be recorded as `BUSINESS RULE CHANGE` and reviewed before implementation.
- Any UAT-P0 stops progression.
- Every UAT-P1 must be fixed or explicitly accepted/deferred with a reason and named approver.
