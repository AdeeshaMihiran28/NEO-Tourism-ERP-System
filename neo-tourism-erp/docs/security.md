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
| OPERATIONS | — | Queue/A | W all | — | Self-service | Self-service | — | Operations |
| ACCOUNTS | — | — | R all | W/A | Self-service | Self-service | — | Accounts |
| HR | — | — | — | — | W/A | Self-service | — | HR |
| IT | — | — | — | — | Self-service | W/A | R | IT |
| CYBERSECURITY | — | — | — | — | Self-service | R | R | IT |
| MARKETING | — | — | — | — | Self-service | Self-service | — | — |

The seed grants employee self-service leave, ticket, and access-request permissions to non-admin roles. Role changes are audit logged. Review the matrix with Neo Tourism management before production and remove any unnecessary permission.

## Production security work still required

Use HTTPS, strict trusted origins, rate limiting and login throttling, secure centralized secrets, MFA/SSO decision, password/reset policy, token revocation or rotation, security headers/CSP, centralized tamper-resistant logs, alerting, database least privilege, dependency scanning, penetration testing, privacy/retention policy, and backup restore testing. Swagger must remain disabled in production.
