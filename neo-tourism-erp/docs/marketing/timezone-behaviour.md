# Marketing timezone behaviour

PostgreSQL stores instants as UTC-backed timestamps. Date-only business fields—travel dates, Campaign dates, Content/NeoTrio deadlines—use database Date semantics and are treated as calendar dates rather than converted moments.

Scheduled Publications, Deal expiry, approvals, audit timestamps and external schedules are instants. API input uses ISO 8601. Backend comparisons use UTC. Calendar query ranges are explicit ISO instants.

The current frontend uses the browser locale/timezone for instant display and `en-GB` date formatting in established Marketing views. Internal UAT must run with Sri Lanka timezone (`Asia/Colombo`) and at least one alternate browser timezone to verify boundaries. External provider timestamps are normalized before storage. Drag/drop sends an ISO timestamp; backend workflow rules remain authoritative.

Known limitation: per-user timezone preference is not yet stored. Browser timezone is the display strategy until that preference exists.
