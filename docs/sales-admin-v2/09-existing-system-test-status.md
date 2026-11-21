# Existing system test status

Checks were selected to avoid code formatting changes and database writes. The configured backend `.env` points to the local development database `neo_tourism_erp_dev`; no isolated E2E database is configured.

| Check | Command | Result | Notes |
|---|---|---|---|
| Backend dependencies | `npm ls --depth=0` | PASS | Declared top-level packages installed. |
| Prisma schema | `npx prisma validate` | PASS | Schema valid. |
| Prisma client | `npx prisma generate` | PASS | Generated Prisma Client 7.9.1. No migration/database mutation. |
| Backend build | `npm run build` | PASS | Nest/TypeScript compilation succeeded. |
| Backend lint (read-only) | `npx eslint "{src,apps,libs,test}/**/*.ts"` | FAIL | 94 findings: 93 errors and 1 warning. Mostly formatting and unsafe `any`/member access in E2E tests; also unsafe trust-proxy access in `src/main.ts`. The repository `npm run lint` was not used because it includes `--fix`. |
| Backend unit tests | `npm test -- --runInBand` | PASS | 7 suites, 18 tests. |
| Backend E2E | `npm run test:e2e` | NOT RUN / ENVIRONMENT BLOCKER | E2E specs create and delete records, while Jest has no isolated database setup and resolves the development `DATABASE_URL`. Running would mutate development data, contrary to the task. |
| Frontend dependencies | `npm ls --depth=0` | PASS WITH WARNING | Six transitive WASM/Sharp packages reported as extraneous. |
| Frontend lint | `npm run lint` | PASS | Next frontend lint completed. |
| Frontend production build | `npm run build` | PASS | Next 16.3.4 compiled and generated 76 routes. |

## Test coverage relevant to this baseline

Repository E2E specs cover customer duplicate prevention and Customer 360; lead creation/claiming/status/notes; follow-ups, missed callbacks, attention and reassignment; Sales handover and Admin acceptance; booking uniqueness/folder numbering/operations; finance payments/reconciliation/discrepancies; lifecycle closing/reopening; RBAC; audit/notifications; and Marketing signal/attribution. Their presence is implementation evidence, but this analysis does not claim they passed in the current environment.

## Required before a release claim

Provide a disposable PostgreSQL database through an E2E-specific environment/setup, apply committed migrations to it, then run `npm run test:e2e`. Do not point the suite at development or production data.
