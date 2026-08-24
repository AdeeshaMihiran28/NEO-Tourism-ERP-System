# Production environment configuration

This is a configuration inventory for the hosting/operations team. It contains variable names and requirements only. Store real values in an approved secret manager; never commit them to the repository or place them in build logs.

## Frontend

| Variable | Required | Production requirement |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | Public HTTPS base URL of the API. This value is exposed to the browser. |
| `APP_ENV` | Yes | Set to `production`. Do not place secrets in this variable or any `NEXT_PUBLIC_*` variable. |

## Backend

| Variable | Required | Production requirement |
|---|---|---|
| `DATABASE_URL` | Yes | Secret PostgreSQL connection URL for the application role. Use TLS and least privilege. |
| `PORT` | Yes | Internal API listener port; `3001` is the project default. |
| `FRONTEND_URL` | Yes | Exact public HTTPS frontend origin used by CORS. Do not use a wildcard. |
| `APP_ENV` | Yes | Set to `production`. |
| `JWT_SECRET` | Yes | High-entropy secret generated and stored by the secret manager. Rotate under an approved session-impact plan. |
| `JWT_EXPIRES_IN` | Yes | Approved access-token lifetime, for example `8h`; security must approve the production value. |
| `ENABLE_API_DOCS` | Yes | Set to `false`. Swagger is also forcibly disabled when `NODE_ENV=production`. |
| `INTEGRATION_HTTP_TIMEOUT_MS` | Yes | Positive provider timeout suitable for the hosting network. |
| `INTEGRATION_SYSTEM_USER_EMAIL` | Conditional | Active, tightly controlled service identity if integrations are enabled. |
| `WEBSITE_WEBHOOK_SECRET` | Conditional | Required only when website lead intake is enabled; exchange through secure channels. |
| `WISE_API_TOKEN` | Conditional | Leave unset. The current Wise adapter is development/mock preparation only and is not approved for live use. |
| `PBX_API_URL` / `PBX_API_TOKEN` | Conditional | Leave unset until a provider sandbox and security acceptance have completed. |

`SHADOW_DATABASE_URL`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_TEST_USER_PASSWORD`, `UAT_USER_PASSWORD`, and `UAT_EMAIL_DOMAIN` are development/UAT tooling values. They must not be used by the production runtime. Do not run development or UAT seeds against production.

## Runtime controls

- Set the process-level `NODE_ENV=production` in the hosting platform.
- Inject secrets at runtime and restrict read access to the API service identity and authorized operators.
- Use separate databases, credentials, secrets, domains, and storage for development, UAT, pre-production, and production.
- Redact database URLs, JWTs, credentials, webhook signatures, passport details, and personal data from logs and support exports.
- Rotate secrets after suspected exposure and record the event in the operational audit process.

