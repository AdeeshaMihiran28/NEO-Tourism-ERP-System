# NEO SIGNAL and NEO RADAR

## Attribution rules

Marketing performance uses explicit `MarketingAttribution` records. Matching a Lead destination to a Campaign destination is never sufficient evidence. Confidence is recorded as `DIRECT`, `TRACKED`, `MANUAL`, or `UNATTRIBUTED`, with a separate source classification.

The website webhook accepts optional Campaign, Deal, Content, UTM, and external Campaign references. A missing reference still creates the Customer and Lead plus an `UNATTRIBUTED` record. An invalid internal ID follows the same safe path and records a warning on the integration event; it is never silently associated with another Marketing record.

Manual reassignment requires a reason. Replacing a `DIRECT` or `TRACKED` relationship additionally requires `marketing.attribution.override`. Previous records are superseded rather than deleted, and the old/new relationship, actor, reason, and time are retained in attribution and audit history.

Attribution is updated with the existing SaleSubmission and Booking IDs as the Lead progresses. No parallel Marketing Lead or outcome tables are created.

## Metric definitions

- Enquiries: distinct attributed Leads for the selected entity and period.
- Reached Quoting / Going to Book: current Lead state or recorded status-transition history.
- Sale Made: Lead state is `SALE_MADE`.
- Bookings: attributed Leads with a Booking.
- Sales Contribution: sum of attributed Booking selling prices. This is not profit.
- Attribution Coverage: distinct non-unattributed Leads divided by all Leads created in the selected period.
- Best Campaign by Sales: the Campaign with the most attributed Sale Made outcomes.
- Highest Sales Contribution: a separate ranking by attributed Booking selling value.

Supplier cost, margin, supplier payments, and profit are not returned by Signal. External platform metrics remain explicitly unavailable until verified provider metrics are synchronized.

## Radar rules

Radar reuses the NEO PULSE seven-day trend algorithm and the existing `MarketingSalesSignal` model. A destination suggestion requires both `MARKETING_OPPORTUNITY_MIN_ENQUIRIES` and `MARKETING_OPPORTUNITY_MIN_GROWTH_PERCENT`. Suggestions are deterministic read models; they do not create database records automatically.

Authorized users can review/accept/dismiss an Opportunity, create an IDEA-stage NEO FLOW Content item, create a normal Campaign, or link an existing Deal. These actions preserve the relationship and are audited. Content still follows the existing creative approval workflow.

## Endpoints

- `GET /marketing/signal`
- `GET /marketing/signal/management`
- `GET /marketing/attribution/lead/:leadId`
- `POST /marketing/attribution/manual`
- `GET /marketing/radar`
- `POST /marketing/opportunities`
- `PATCH /marketing/opportunities/:id/status`
- `POST /marketing/opportunities/:id/create-content`
- `POST /marketing/opportunities/:id/create-campaign`
- `POST /marketing/opportunities/:id/link-deal`

Frontend workspaces are `/marketing/performance`, `/marketing/performance/management`, and `/marketing/radar`.

## UAT checks

1. Submit one website enquiry with a valid Campaign reference and confirm it is `TRACKED`.
2. Submit one without tracking and confirm the Lead remains in Live New Leads with `UNATTRIBUTED` coverage.
3. Progress the tracked Lead through Quoting, Going to Book, Sale Made, and Booking.
4. Confirm Signal shows the funnel and Booking selling value, never profit or supplier cost.
5. Create sufficient two-period demand and confirm Radar suggests only after both configured thresholds.
6. Explicitly create an Opportunity and action it into Content or a Campaign; confirm no approval workflow was bypassed.
