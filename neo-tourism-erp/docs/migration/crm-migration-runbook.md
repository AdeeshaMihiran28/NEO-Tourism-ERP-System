# CRM migration runbook (future execution)

This runbook is a plan, not approval to connect, extract, import, or cut over. Step 24 executes none of these phases.

## Phase 1 — authorization and source snapshot

Name data owner, technical owner, security approver, business reviewers, and rollback authority. Confirm scope/retention. Create an encrypted snapshot/export with timestamp and checksum; retain the live CRM unchanged. Verify the discovery credential is read-only.

## Phase 2 — schema discovery and validation

Identify engine/version, encoding/collation, timezone, size, tables/views, keys, constraints, indexes, row counts, archived flags, attachment storage, and API coverage. Classify every table `KNOWN`, `LIKELY BUSINESS DATA`, `SYSTEM / FRAMEWORK`, `LOG / AUDIT`, `TEMPORARY`, or `UNKNOWN`. Do not discard unknowns.

## Phase 3 — bounded read-only profiling

Collect aggregates only: null/blank/distinct counts, meaningful duplicates, date ranges/sentinels, statuses, users, currencies, numeric types/precision, text lengths, orphans, attachment counts/broken references, and encoding anomalies. Mask any necessary sample; never put raw PII in reports.

## Phase 4 — mapping and approval

Create evidence-based schema, field, status, user, quality, deduplication, attachment, and business-decision reports. Classify fields `KEEP`, `TRANSFORM`, `MERGE`, `SPLIT`, `DROP`, `UNKNOWN`, or `BUSINESS_DECISION_REQUIRED`. A `DROP` needs a technical reason and business confirmation when potentially valuable. Unknown statuses remain unknown.

## Phase 5 — transform and validate

Implement engine-specific read-only source adapter only after discovery. Transform conservatively: trim strings, lowercase/trim validated email, normalize phone only with defensible country context, preserve original currency/precision and trustworthy timestamps, quarantine invalid dates/money, map users by verified identifiers, retain stable legacy IDs, and distinguish historical audit. Never silently round or truncate.

## Phase 6 — isolated staging import

Provision the separate staging database, apply committed ERP migrations, disable all normal automations/integrations, and load parent-first according to actual foreign keys. Conceptual order is organization/user mappings, customers, leads, activities/follow-ups, sales, bookings, passengers/suppliers/references/tasks, finance, attachments, audit, and reliable attribution; revise it from the real schema.

## Phase 7 — automated reconciliation

Produce per-entity source/mapped/imported/skipped/failed/difference counts, orphan checks, deterministic stable-ID samples, and financial totals by original currency. Validate timestamps, status distributions, chronology, document manifests, and checksums where useful. Keep sensitive values out of public reports.

## Phase 8 — business validation and remediation

Sales validates customer/lead history and ownership; Operations validates folders/passengers/references/tasks; Accounts validates per-currency totals and reconciliation; security/data owners validate PII, users, audit, retention, and access. Log defects as MIGRATION-P0 through P3 and revise versioned mappings—never patch the source.

## Phase 9 — repeatability proof

Recreate the disposable target and rerun. Then retry the same batch against its completed target to prove idempotency. Confirm no duplicate customers, leads, activities, bookings, payments, attachments, or audit events and no notifications/integrations were triggered.

## Phase 10 — later cutover planning

Decide full-only versus full-plus-delta from actual CRM operation. Plan source freeze/read-only window, final backup, delta boundary, ERP backup, communications, validation, rollback thresholds, go/no-go owners, and legacy retention. Do not implement CDC or schedule cutover without a demonstrated need and approval.

## Safe migration log contract

Log batch ID, entity, masked or internal legacy ID, target ID, status, error code, safe message, mapping version, and timestamp. Error categories: `VALIDATION_ERROR`, `MAPPING_ERROR`, `MISSING_PARENT`, `DUPLICATE`, `UNKNOWN_STATUS`, `INVALID_DATE`, `INVALID_MONEY`, `USER_MAPPING_MISSING`, `SOURCE_ERROR`, `TARGET_ERROR`, `OTHER`. Never log credentials, tokens, passport values, or full financial/customer data.

## Rollback

Before production, define measurable abort thresholds. In staging, discard/restore only the verified isolated target. In a later production event, stop writers/integrations, preserve evidence, and use the approved target backup/forward-fix strategy; never write compensating changes to the legacy CRM or run unreviewed destructive SQL.

