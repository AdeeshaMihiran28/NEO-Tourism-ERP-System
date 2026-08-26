# NEO LAUNCH — Marketing Deals

Step 23A introduces the Marketing domain and its first functional workspace, NEO LAUNCH. It intentionally does not implement NEO FLOW, NEO GREENLIGHT, NEO PLAN, NEO SIGNAL, NEO RADAR, or NEO STUDIO.

## Deal Card lifecycle

Deal Codes are allocated server-side through a transactionally updated yearly counter in the form `DEAL-YYYY-000001`. New deals begin as `DRAFT` with `DRAFT` approval. Submission, approval/rejection, scheduling, go-live, and suspension use dedicated permission-controlled actions.

Only an approved deal can become live. Live deals within 24 hours of expiry become `EXPIRING`; deals at or beyond expiry become `EXPIRED`. The hourly evaluator is idempotent and uses persisted notification timestamps to prevent repeated alerts.

Material changes to price, travel dates, departure, baggage, expiry, or terms on approved/live deals require a reason and set `contentReviewRequired`. This flag warns that connected marketing content may require review without creating fake creative records.

## Website publishing truthfulness

`WebsiteDealPublisher` is the outbound abstraction. Configuration requires both `WEBSITE_DEALS_API_URL` and `WEBSITE_DEALS_API_TOKEN`. If absent, the internal lifecycle still succeeds and records `NOT_CONFIGURED`. Failed calls produce a failed IntegrationEvent and action-required notification while the internal deal remains correctly expired or suspended. The ERP never reports an external publication/removal as successful without confirmation.

## Sales visibility

Sales Approved Offers returns only approved, unexpired `LIVE` or `EXPIRING` deals. Its backend selection excludes approval actors, suspension details, audit history, internal website state, owner data, and other Marketing administration fields.

## Permissions

Ten `marketing.deal.*` permissions independently control viewing, creation, editing, submission, approval, scheduling, publishing, suspension, channel management, and Sales-safe viewing. Default seed recommendations grant create/edit/submit to MARKETING, full deal control to MARKETING_MANAGER, read/approval to DIRECTOR, and approved-offer-only access to SALES.
