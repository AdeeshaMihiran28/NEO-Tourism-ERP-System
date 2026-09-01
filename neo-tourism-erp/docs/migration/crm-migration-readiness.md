# CRM migration readiness

No source schema or data is available. “Target identified” means only that a plausible current ERP model exists; it does not assert compatibility.

| Entity | Source identified | Target identified | Field mapping | Status mapping | User mapping | Data quality checked | Business decision pending | Test migration readiness |
|---|---|---|---|---|---|---|---|---|
| Users/agents | BLOCKED | READY | BLOCKED | NOT_APPLICABLE | BLOCKED | BLOCKED | historical-user representation | BLOCKED |
| Customers | BLOCKED | READY | BLOCKED | BLOCKED | BLOCKED | BLOCKED | duplicate policy and actor mapping | BLOCKED |
| Leads/enquiries | BLOCKED | READY | BLOCKED | BLOCKED | BLOCKED | BLOCKED | statuses, ownership, archive scope | BLOCKED |
| Activities/notes | BLOCKED | READY | BLOCKED | BLOCKED | BLOCKED | BLOCKED | legacy-history representation | BLOCKED |
| Follow-ups/callbacks | BLOCKED | READY | BLOCKED | BLOCKED | BLOCKED | BLOCKED | future-action and notification handling | BLOCKED |
| Sales | BLOCKED | READY | BLOCKED | BLOCKED | BLOCKED | BLOCKED | source-to-SaleSubmission cardinality | BLOCKED |
| Bookings/folders | BLOCKED | READY | BLOCKED | BLOCKED | BLOCKED | BLOCKED | required Lead/Sale parents and folder numbers | BLOCKED |
| Passengers | BLOCKED | READY | BLOCKED | NOT_APPLICABLE | NOT_APPLICABLE | BLOCKED | Customer versus Booking relationship | BLOCKED |
| Suppliers/references | BLOCKED | READY | BLOCKED | BLOCKED | NOT_APPLICABLE | BLOCKED | supplier deduplication | BLOCKED |
| Payments/finance | BLOCKED | READY | BLOCKED | BLOCKED | BLOCKED | BLOCKED | calculations, precision, currencies | BLOCKED |
| Documents | BLOCKED | READY | BLOCKED | NOT_APPLICABLE | BLOCKED | BLOCKED | storage, scanning, retention | BLOCKED |
| Audit history | BLOCKED | PARTIAL | BLOCKED | NOT_APPLICABLE | BLOCKED | BLOCKED | dedicated legacy audit design | BLOCKED |
| Marketing source | BLOCKED | READY | BLOCKED | BLOCKED | BLOCKED | BLOCKED | attribution evidence threshold | BLOCKED |

## Gate to begin controlled test migration

All applicable rows require a real source inventory, approved mappings, profiling results, business decisions, migration-reference design, and automated reconciliation baselines. No row may move to `READY` based on name similarity or assumptions.

