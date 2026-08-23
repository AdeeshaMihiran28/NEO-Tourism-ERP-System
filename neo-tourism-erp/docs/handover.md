# Internal testing handover

## Scope and readiness

Neo Tourism ERP 2.0 is suitable for controlled internal development/QA testing. It is not production-ready and no production deployment was performed.

## Start checklist

- Configure backend and frontend environment files without committing secrets.
- Confirm PostgreSQL is running and `npx prisma migrate status` reports no pending migration.
- Run the seed with development-only credentials.
- Start backend on 3001 and frontend on 3000; verify `/health` before login.
- Use one terminal per service. `EADDRINUSE` means another process is already listening on that port; do not start a duplicate server.
- A browser `401` normally means the stored JWT is absent/expired/inactive. Sign in again. `403` means the signed-in role lacks that action. A browser-extension hydration warning should be reproduced in an extension-free profile before treating it as application code.

## Acceptance checklist

- Run backend unit and end-to-end tests, Prisma validation/status, and both production builds/lints.
- Sign in as each seeded role and confirm navigation and direct-URL access match `security.md`.
- Perform the journey in `business-workflow.md`, including one rejected unauthorized action.
- Confirm no password, full passport, integration secret, or supplier cost is shown to an unauthorized user.
- Run callback/lifecycle schedulers twice in test and confirm no duplicate alert/state change.
- Check Chrome/Edge at desktop and narrow viewport; test keyboard focus, labels, loading, empty and error states.
- Review audit records for administration, Sale Made, handover, booking edits, finance, lifecycle, HR/IT approvals, roles, and integrations.

## Known limitations / production blockers

- Provider integrations are foundations only and require real sandbox/provider acceptance tests.
- No production hosting, CI/CD, managed secret store, centralized monitoring, rate limiting, MFA/SSO, malware scanning for document URLs, or disaster-recovery implementation is included.
- Operational HR/IT self-service lists are capped rather than fully cursor paginated.
- Swagger exposes the route model in development and must remain disabled in production.
- npm currently reports a high-severity recursive-merge advisory through Prisma CLI's development configuration dependency. npm proposes a Prisma 7 to 6 downgrade, which is incompatible with this codebase; do not apply `npm audit fix --force`. Track the upstream Prisma dependency update. The production API does not invoke Prisma CLI configuration merging at request time, but the development toolchain finding remains open.

## Ownership after handover

Assign named owners for product decisions, access approvals, security, database operations, production deployment, incident response, and legacy CRM migration. Require change review and migration backups for every database release.

Production hosting/deployment is explicitly the responsibility of the designated external operations team. The existing CRM migration has not started because its real schema/data access has not been provided; follow `crm-migration-plan.md` when access and business sign-off are available.
