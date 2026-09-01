# CRM migration staging plan

## Isolation

Use a separate, disposable ERP migration/staging PostgreSQL database. It must not be the production ERP database, the normal development/UAT database, or the live CRM. Restore/import only from an approved read-only snapshot/export. Network rules must prevent any migration process from writing back to the CRM.

## Environments and flow

`Legacy CRM (read only) → encrypted extract → transform/validate → separate ERP migration database → automated reconciliation → business review`

Only after repeated clean rehearsals and written approval may a separate cutover plan be considered.

## Provisioning controls

- Unique database name and credentials for each rehearsal; least-privilege loader role on staging only.
- Apply the committed ERP migrations with `prisma migrate deploy`; never use `migrate reset` on shared/live data.
- Record application commit, migration list, source snapshot checksum/time, mapping version, and batch ID.
- Disable schedulers, outbound integrations, email/SMS, webhooks, and employee/customer notifications.
- Use non-production object storage for attachment rehearsals; files remain out of Step 24.
- Encrypt storage and transport, restrict access, log access, and define approved retention/secure deletion.
- Take a target snapshot before each load and destroy/recreate only the explicitly named disposable target after verification.

## Idempotency and traceability

Before a loader exists, approve a migration-reference mechanism with a unique source-system/entity/ID key and target entity/ID. Every batch records mapping version and outcome. Upserts must be based on stable source identity—not email, phone, display name, folder dates, or financial similarity. Retrying a batch must not duplicate parents, children, payments, documents, or historical audit.

## Transaction and failure plan

Determine batch size from actual source volume. Use bounded transactions per entity/chunk, parent-first ordering, checkpoints, and a quarantine/rejection record for failures. A failed child must not corrupt its parent or cause unrelated batches to roll back. Never use one unbounded transaction without volume evidence.

## Reconciliation evidence

For each entity/batch record source, mapped, imported, skipped, failed, and difference counts with explanations. Validate orphans and deterministic stable-ID samples. Reconcile selling price, supplier cost, passenger payments, supplier payments, fees, discounts, adjustments, and profit by original currency without conversion. Compare min/max dates, distinct statuses/currencies, and attachment manifest counts. Reports contain aggregates and masked identifiers only.

## Exit criteria

- Zero unexplained count or financial differences.
- No MIGRATION-P0/P1 defects open.
- Mapping and data-quality reports approved by business/data owners.
- RBAC/PII review passes and normal automation remains suppressed.
- Idempotent rerun produces no duplicate records.
- Rollback/restore rehearsal succeeds.
- Written go/no-go approval is recorded.

