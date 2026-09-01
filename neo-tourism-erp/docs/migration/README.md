# CRM migration discovery

Step 24 is a discovery and planning gate. No legacy CRM data has been accessed or imported.

## Current decision

The repository and current process environment contain no legacy CRM connection configuration, schema export, backup/test copy, structured export, source schema documentation, or legacy connector. Evidence-based legacy inventory and mapping are therefore blocked.

Available documents:

- `erp-target-schema-inventory.md` — inventory of the actual current Prisma target models.
- `crm-access-required.md` — exact source package and access controls required to resume discovery.
- `crm-migration-readiness.md` — truthful entity-level readiness matrix.
- `crm-staging-plan.md` — isolated staging and reconciliation design.
- `crm-migration-runbook.md` — future controlled migration phases; it is not authorization to execute them.
- `crm-security.md` — PII, credential, logging, and source-protection controls.

Legacy schema, field, status, user, data-quality, and duplicate reports have deliberately not been fabricated. Those reports must be created from an approved real schema/export in the next Step 24 discovery pass.

