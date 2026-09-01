# Marketing implementation status

Audited against the codebase, Prisma schema, permission seed, frontend routes and automated tests on 26 August 2026.

| Module | Backend | Frontend | Database | Permissions | Audit | Notifications | Tests | Status | Blocking issues |
|---|---|---|---|---|---|---|---|---|---|
| NEO PULSE | Real parallel summaries | Command hub and authorized quick actions | Shared projections | `marketing.pulse.*` and source permissions | Read-only views not audited | Alert/signal summaries | Pulse E2E | WORKING | None |
| NEO LAUNCH | Controlled Deal lifecycle and website adapter | Deal list/detail/forms and Sales offers | Deal, channels, Campaign/Content links | Granular Deal and Sales-view permissions | Critical lifecycle actions | Approval, expiry, suspension outcomes | Deal E2E | WORKING | External website configuration remains optional |
| NEO FLOW | Campaign/content workflow | Board, forms and details | Campaign, Content and immutable versions | Granular create/edit/version permissions | Create/update/version/stage | Assignment/deadline/change alerts | Creative E2E | WORKING | None |
| NEO GREENLIGHT | Version-specific review engine | Queue and history | Approval references exact version | Separate review permissions | Decisions and reviewer | Required review/change/approval | Creative E2E | WORKING | None |
| NEO PLAN | Aggregated projections and controlled reschedule | Day/week/month calendar | Manual entries plus authoritative projections | View/create/edit/reschedule | Manual/reschedule actions | Deduplicated alerts | Calendar E2E | WORKING | Meta is not configured locally |
| NEO SIGNAL | Deduplicated attribution funnel; Decimal monetary sum | Explicit rankings/coverage | Shared Attribution, Lead, Booking | View/management/override separated | Manual changes/overrides | Not view-noise | Signal E2E | WORKING | External engagement unavailable without verified provider metrics |
| NEO RADAR | Thresholded trends and explicit actions | Intelligence dashboard | Shared signals/opportunities | View/create/manage separated | Opportunity actions | Permission-aware signals | Signal/Radar E2E | WORKING | None |
| NEO STUDIO | Vault, ideas, production, library, performance | Six Studio routes | Relational characters and shared Marketing links | `marketing.neotrio.*` family | Critical Studio actions | Assignment/review/deadline/approval | Studio E2E | WORKING | External publishing remains unverified without a provider reference |

Overall status: **WORKING — READY FOR INTERNAL UAT**. This is not a production-readiness statement.
