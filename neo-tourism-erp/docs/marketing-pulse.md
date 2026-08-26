# NEO PULSE — Marketing Command Hub

NEO PULSE is a read-oriented command dashboard over authoritative ERP records. It does not copy Deal, campaign, creative, approval, publication, calendar, alert, Lead, or workload data.

## Dashboard API

`GET /marketing/pulse` returns only sections supported by the authenticated user's permissions. Independent aggregates execute in parallel and use counts and compact projections rather than full histories or creative files.

The dashboard covers:

- live, scheduled, expiring, expired, and suspended Deal activity;
- campaign status and campaigns ending within seven days;
- NEO FLOW stage counts, overdue/due/urgent content, and approved current versions ready to publish;
- creative and Deal approval queues, with `<24h`, `1–2 days`, and `3+ days` ageing;
- NEO PLAN today, tomorrow, and next-seven-day activity;
- the existing Marketing Alerts service;
- CRM enquiry counts and deterministic destination trends;
- Sales-to-Marketing signals; and
- simple assigned creative workload.

## Destination trend calculation

Trending compares Lead volume in the current seven-day window with the preceding seven-day window:

`growth = ((current - previous) / previous) × 100`

A destination is marked `TRENDING` only when growth is at least 20% and current volume meets `MARKETING_TREND_MIN_CURRENT_ENQUIRIES` (default `5`). A zero previous count is reported as new growth but still must satisfy the minimum volume. This is deterministic reporting, not AI prediction.

## Attribution boundary

Lead records currently have no reliable Marketing campaign identifier. Campaign enquiry attribution therefore returns `NOT_YET_AVAILABLE`. NEO PULSE never infers campaign performance from matching destination text. Full campaign-to-enquiry-to-sale attribution remains deferred to NEO SIGNAL.

## Sales signals

Sales can submit customer questions, content and offer requests, destination interest, recurring objections, Marketing support needs, or other signals. Marketing users with management permission can mark them reviewed, actioned, or dismissed. Create and status transitions are audited. Only high/urgent submissions notify authorized Marketing recipients.

## Deferred scope

NEO SIGNAL analytics and attribution, NEO RADAR intelligence, automated opportunity creation, engagement/reach integrations, and NEO STUDIO are intentionally excluded.
