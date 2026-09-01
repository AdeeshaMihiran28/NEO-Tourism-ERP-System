# CRM migration security controls

## Mandatory controls

- Source credentials are dedicated, time-limited, least-privilege, read-only, and delivered through the approved secret manager.
- TLS/encrypted transport is required; exports and backups are encrypted at rest with restricted access and access logging.
- No credential, connection string, token, raw export, unmasked sample, or PII-bearing report enters Git.
- Discovery uses catalog queries, bounded `SELECT`, counts, and aggregates only. No source write or DDL permission is accepted.
- Logs contain safe error codes and internal/masked IDs only. Names, contacts, addresses, DOB, passport data, payment references, financial details, credentials, and tokens are excluded.
- Necessary samples are minimized, access-restricted, and masked (for example `j***@example.com`, `N*******`). Prefer aggregate statistics.
- Temporary extracts have an owner, location, purpose, retention deadline, and approved secure-deletion process.
- Migration tooling is internal CLI/batch tooling, not a public API or arbitrary-SQL endpoint.
- Staging has outbound notifications, CRM write paths, marketing/customer communications, and live financial/provider integrations disabled.
- Imported historical events remain distinguishable from native ERP activity; the migration system user must not impersonate historical actors.

## Safety validation for this Step 24 pass

| Check | Result |
|---|---|
| Old CRM records changed | No source was accessed; none changed |
| Destructive SQL executed | No |
| Production ERP records imported/overwritten | No |
| Credentials committed or printed | No |
| PII written to docs/logs | No |
| Guessed legacy mapping marked ready | No |
| Public migration endpoint created | No |
| Discovery/live migration code executed | No |

