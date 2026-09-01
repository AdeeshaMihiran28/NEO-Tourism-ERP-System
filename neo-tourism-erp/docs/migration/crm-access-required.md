# Legacy CRM access required

## Finding

`SOURCE CRM ACCESS: NOT AVAILABLE`

The repository was checked for configuration names, migration scripts, database documentation, SQL/schema dumps, CSV/structured exports, backup metadata, old CRM source code, and source connectors. The current process environment was checked for variable names containing CRM, legacy, source-database, or migration terms. No usable legacy source artifact or access configuration was found. Existing project documents explicitly say that real CRM migration has not started.

No secret values were printed, copied, or committed. The application's `DATABASE_URL` and `SHADOW_DATABASE_URL` belong to the new ERP and are not evidence of legacy CRM access.

## Provide one approved source package

### Option A — read-only database access (preferred for complete discovery)

- actual database engine and version;
- host, port, and database/service name;
- a dedicated read-only username with catalog access and `SELECT` only;
- password delivered through the approved secret manager, never chat, Markdown, `.env.example`, tickets, or Git;
- TLS requirements and certificate/CA delivery method;
- network/VPN/allow-list instructions;
- source owner, security approver, and approved discovery window;
- confirmation whether the database is production, replica, snapshot, or sanitized test copy;
- timezone, character set/collation, and any row-level security constraints.

The account must not have `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, schema-migration, or administrative privileges.

### Option B — schema export

Provide a schema-only export appropriate to the actual engine, including tables, columns, data types, primary/foreign keys, indexes, unique constraints, defaults, views, and enum/check constraints. Also provide engine/version, character set/collation, and timezone. A schema-only export enables structure mapping but not row counts, status extraction, duplicate analysis, data profiling, or reconciliation baselines.

### Option C — backup or test copy

Prefer a sanitized, encrypted, access-controlled test copy. Supply restore instructions, engine/version, checksum, snapshot timestamp, sanitization statement, retention period, and an isolated restore target. Approval must state that the copy may be used for migration discovery.

### Option D — structured exports

Provide machine-readable exports for every applicable business area, not only customers: users/agents, departments/teams, customers/contacts, leads/enquiries, assignments, activities, notes, callbacks/follow-ups, quotes/sales, bookings/folders, passengers, suppliers/references, payments/finance, documents/attachment metadata, audit history, and marketing attribution. Include:

- a data dictionary and stable source primary keys;
- relationship/foreign-key columns;
- distinct status/code definitions;
- export timestamp, timezone, encoding, delimiter and quoting rules;
- source row counts and checksums;
- currency/precision definitions;
- archived/soft-deleted flags;
- attachment manifest without transferring files yet.

## Information required regardless of option

- authoritative system and scope (all history or an approved period);
- whether the old CRM will continue changing during testing (one-time versus full-plus-delta);
- data owner and business reviewers for Sales, Operations, Accounts, HR/security, and Marketing;
- applicable retention, privacy, residency, and deletion rules;
- approved secure location for exports and discovery reports;
- definition of inactive/former users and archived/deleted records;
- whether a supported CRM API exists and its historical/attachment/audit coverage;
- known folder-number rules and supported currencies.

## Safe hand-off acceptance checks

Before discovery starts, verify the package checksum, permissions, snapshot date, encryption, access logging, and expiry. Test the database identity and read-only privileges without mutation. Discovery may use catalog queries, `SELECT`, safe counts, and bounded aggregate profiling only. It must not write to the source.

Until this package is supplied, the source engine, tables, counts, terminology, fields, relationships, statuses, users, quality defects, duplicate rates, currencies, dates, attachments, and audit representation remain `UNKNOWN`.

