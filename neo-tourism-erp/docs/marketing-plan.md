# NEO PLAN — Smart Marketing Calendar

NEO PLAN is a normalized calendar over existing Marketing records. Campaign dates, active Deal expiry dates, creative deadlines, scheduled publications, and synchronized external events are projected from their authoritative records. They are not copied into manual calendar entries.

## Calendar controls

- `GET /marketing/calendar` accepts an ISO date range and optional type, channel, campaign, deal, owner, status, and source filters.
- Manual events are limited to `SEASONAL`, `INTERNAL_EVENT`, and `OTHER` planning items.
- Publication drag/drop updates `MarketingPublication.scheduledAt` through the backend.
- Deal expiry, campaign, content-deadline, published, completed, cancelled, and external events cannot be moved from the calendar.
- Reschedules record the previous and new ISO date/time in the audit trail.

## Alerts

V1 alerts cover configured content gaps, Deal expiry within 24 hours, approved current creative versions ready to publish, overdue content, and campaigns starting tomorrow. `MARKETING_CONTENT_COVERAGE_DAYS` uses ISO weekdays (`1` Monday through `7` Sunday). Daily notification generation checks for an existing same-day entity alert before creating another notification.

## Meta foundation

Meta credentials are environment-only and never returned by an API. Without configuration, `/integrations/meta/status` reports `NOT_CONFIGURED`, sync returns a controlled non-success status, and internal calendar data remains available.

`META_MOCK_ENABLED=true` activates the development adapter for safe synchronization testing. Provider events use `(provider, externalReference)` as the idempotency boundary and store only normalized fields plus limited safe metadata. `META_MOCK_FAIL=true` exercises failure isolation. A real Meta HTTP adapter and approved application access remain deployment prerequisites.

An ERP `LIVE` state is not proof of external publishing. External `PUBLISHED` is displayed as verified only when an integration confirms it.

## Deferred scope

NEO SIGNAL, attribution, NEO RADAR, full NEO STUDIO, Meta ad creation/budgets/audiences/optimization, and advanced social analytics are intentionally excluded.
