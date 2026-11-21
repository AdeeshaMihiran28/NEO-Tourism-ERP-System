# Security and permission model

## Implemented controls

- Passwords are hashed with bcrypt (12 rounds for application and seed writes).
- Login returns a signed JWT; inactive accounts are rejected at login and token validation.
- Controllers use JWT and permission guards; services additionally enforce record ownership and workflow state.
- Login failures use the same message for unknown email and wrong password.
- DTO validation rejects unknown fields and enforces types, lengths, UUIDs, dates, enums, and decimal formats.
- Non-finance booking readers do not receive selling price or supplier costs. Passport numbers are masked unless passenger-management access is granted.
- `toSafeUser` never returns password hashes.
- Audit payload sanitization redacts password, token, authorization, cookie, secret, API-key, and database-URL fields recursively.
- Integration status responses never expose provider credentials.
- Website lead requests require the configured webhook secret and duplicate external references are processed idempotently.
- Closed booking edits require explicit exceptional permission or a reasoned reopen operation.

## Default role matrix

Legend: `R` read, `W` operational write, `A` approve/administer, `Own` own records only, `—` none by default.

| Role | CRM | Sales card | Bookings | Finance | HR | IT | Audit | Dashboards |
|---|---|---|---|---|---|---|---|---|
| SUPER_ADMIN | A | A | A | A | A | A | R | All |
| DIRECTOR | R all | — | R all | R | R | R | R | All |
| MANAGER | R/assign | — | R all | — | R/leave A | R | — | All |
| SALES | R/W own | W own | R own | — | Self-service | Self-service | — | Sales |
| OPERATIONS | — | Queue/A | W all | Cost input only | Self-service | Self-service | — | Operations |
| ACCOUNTS | — | — | R all | W/A | Self-service | Self-service | — | Accounts |
| HR | — | — | — | — | W/A | Self-service | — | HR |
| IT | — | — | — | — | Self-service | W/A | R | IT |
| CYBERSECURITY | — | — | — | — | Self-service | R | R | IT |
| MARKETING | — | — | — | — | Self-service | Self-service | — | — |

The seed grants employee self-service leave, ticket, and access-request permissions to non-admin roles. Role changes are audit logged. Review the matrix with Neo Tourism management before production and remove any unnecessary permission.

## Marketing intelligence separation

- `marketing.signal.view` grants everyday attributed performance; `marketing.signal.management` separately grants management detail.
- `marketing.attribution.manage` permits evidence-based manual linking. Replacing tracked/direct attribution also requires `marketing.attribution.override`.
- `marketing.radar.view`, `marketing.opportunity.create`, and `marketing.opportunity.manage` are independent capabilities.
- Creating Content or Campaign work from an Opportunity additionally requires `marketing.content.create`; linking a Deal additionally requires `marketing.deal.view`.
- Sales can submit an existing Marketing Sales Signal but receives no Signal, attribution override, or Opportunity management permission by default.

## Production deployment requirements

- Terminate HTTPS at a trusted reverse proxy or load balancer. Set `TRUST_PROXY=true` only when exactly one trusted proxy is in front of the API. Keep direct API access private.
- Set `NODE_ENV=production`, `APP_ENV=production`, a unique JWT secret of at least 32 bytes, and explicit comma-separated HTTPS origins in `FRONTEND_URL`. Production startup rejects weak placeholders, HTTP/wildcard origins, a missing database URL, and Meta mock mode.
- Keep secrets in the deployment secret store, grant the application database user only the permissions it needs, and never run development seeds or migration-reset commands during startup.
- Send application and audit logs to access-controlled, append-oriented centralized storage. Alert on repeated 401/403/429 responses, rejected webhooks, disabled-user access, privileged role/user changes, Finance approvals/posting, and integration failures. Retain the request ID for incident correlation.
- The frontend currently stores bearer tokens in `localStorage`. Its short lifetime and server-side active-user/permission reload reduce persistence, but an XSS could steal a token. A tested HttpOnly-cookie or managed identity migration remains required before treating browser session security as mature.
- Privileged-user MFA and password reset are not implemented. Select a managed identity provider or implement audited TOTP with protected secret storage and recovery before production use by System, IT, HR, Finance, and management administrators.
- Helmet/API headers and frontend security headers are enabled. Add a deployment-specific Content Security Policy only after testing every required Next.js asset and integration; do not weaken the other headers.

## Backup and recovery runbook

- Back up PostgreSQL at least daily with point-in-time recovery where the provider supports it. Retain daily backups for 35 days and monthly backups for 12 months.
- Back up the private object store containing booking, HR, Finance, and Marketing documents with versioning enabled. Database and document backups must use provider encryption and a separate restricted backup role.
- A named infrastructure administrator owns restores; application administrators do not receive raw backup access. Record and review every restore.
- Quarterly, restore the latest database and object-store backup into an isolated non-production environment. Verify authentication, Customer-to-Booking flow, document references, HR access boundaries, Finance reconciliation, and audit-log continuity. Record recovery time, recovery point, and any missing objects before deleting the isolated environment.
- For an incident: identify and contain the failure, preserve logs, redeploy the pinned application build, restore secrets/configuration, restore PostgreSQL and documents only if required, rotate exposed credentials, run health checks, then verify authentication and the critical Sales, Booking, Operations, HR, Finance, Marketing, and integration workflows.

Restore execution is **not verified in the current development environment**. Production ownership, storage, alert routing, retention/privacy policy, penetration testing, and the MFA/session improvements above remain launch decisions.
