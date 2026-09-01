# Marketing internal UAT scenarios

Record actual IDs, tester, date and evidence for every run.

1. **Deal:** draft → submit → approve → LIVE; verify Sales offer; link Campaign/Content; change price and verify review-required; suspend and verify Sales removal/audit/notification.
2. **Creative:** IDEA → CREATING; V1 review/change request; V2 approval; verify exact current/approved version; schedule and controlled LIVE.
3. **Calendar:** verify Campaign, Deal expiry, Content deadline, Publication and NeoTrio dates in day/week/month views; reschedule an eligible Publication/manual event; verify Deal expiry drag is rejected.
4. **Attribution:** submit a tracked fictional website enquiry; claim Lead; reach QUOTING, GOING_TO_BOOK and SALE_MADE; create Booking; verify Signal shows 1 enquiry, quote, sale and booking plus exact selling-value contribution. Verify Finance-only data remains hidden.
5. **Untracked enquiry:** submit a valid enquiry without tracking; verify Customer and Lead are created and attribution is UNATTRIBUTED.
6. **Radar:** create enough fictional destination enquiries to exceed configured current/previous threshold; verify trend; create Opportunity and explicitly action Campaign/Content/Deal/NeoTrio.
7. **Studio:** use Ricky + Flip Idea; idempotently convert; SCRIPT → PRODUCTION → REVIEW; process Greenlight changes and approval; verify Plan, PUBLISHED, single Library item and supported performance.
8. **Failure resilience:** with test adapters only, simulate Meta and website failure; verify internal modules stay usable and IntegrationEvent/provider state records failure.
9. **RBAC/object access:** verify Marketing User cannot approve, Sales cannot edit, Management view does not imply manage, unrelated employee cannot access Marketing, and asset/attribution permissions remain isolated.
10. **Timezone/responsive:** run Asia/Colombo and alternate timezone boundary checks; test desktop/mobile navigation, loading, error and empty states.
