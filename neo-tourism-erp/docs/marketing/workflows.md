# Marketing workflows

## Master flow

Deal → Campaign → Content → version-specific Greenlight approval → Plan schedule → Publication → Enquiry → Lead → Sale → Booking → Signal performance.

Campaigns may exist without a Deal. Multiple Campaigns may reference one Deal. Removing a Campaign does not cascade-delete its Deal.

## Deal propagation

Material changes to price, travel dates, departure, baggage, expiry or key terms flag linked READY/LIVE creative as review-required, audit the reason and notify relevant users. Content is never rewritten automatically. Suspended/expired Deals disappear from active Sales offers while history remains. Outbound website removal is attempted only when configured; failure is recorded and cannot roll back internal suspension/expiry.

## Creative workflow

IDEA → CREATING → REVIEW → READY → LIVE. READY requires approval of the current immutable version. Change requests return content to CREATING; rejection returns to the controlled IDEA state with history preserved. LIVE uses the controlled action and verifies current-version approval.

## Calendar controls

Manual internal events and eligible scheduled Publications may be rescheduled. Deal expiry, authoritative Content deadlines, Campaign projections, published activity and external Meta events are read-only projections. The backend rejects prohibited drag/drop attempts.

## NeoTrio

Idea → SCRIPT → PRODUCTION → REVIEW → Greenlight → READY → controlled PUBLISHED → idempotent Library item. Deadline and planned publication automatically project into NEO PLAN.
