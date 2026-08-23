# CRM migration plan

No legacy CRM data is imported by this milestone. Migration must be rehearsed and signed off separately.

1. Inventory legacy customer, lead, activity, note, ownership, booking, and consent fields; identify authoritative sources and record counts.
2. Agree mappings to ERP enums and relationships, including timezone/currency normalization and legacy identifiers.
3. Export a read-only snapshot into an encrypted staging area with access logging.
4. Profile duplicates and invalid emails/phones/dates. Define deterministic deduplication rules; never silently merge ambiguous customers.
5. Build an idempotent migration program that writes source system and source ID to migration metadata, validates referential integrity, and emits a rejection report.
6. Rehearse against a masked database, compare counts/totals/samples, test permissions, and obtain Sales/Operations sign-off.
7. Define freeze window, final delta export, backup, rollback threshold, owner contacts, and communication plan.
8. Run production migration with secrets from the approved vault, reconcile counts and financial totals, and retain signed evidence.
9. Restrict or archive the legacy system according to retention/privacy policy.

Never place customer exports, credentials, or unmasked production data in this repository.
