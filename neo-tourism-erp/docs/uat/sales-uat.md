# Sales UAT

Use UAT Sales 1 unless a step says otherwise. Use only records marked as UAT data.

## S1 — New customer enquiry

1. Open **Live New Leads** and select the Fresh Unassigned Lead.
2. Take the lead. Confirm it leaves the Live queue and appears in **My Pipeline**.
3. Open it and confirm the customer, destination, travel date, source, and summary are easy to find.
4. Change `HANDLING` to `QUOTING`.
5. Add a Sales note and confirm it appears once.
6. Schedule a callback and confirm the date/time and note are visible.
7. Complete the callback and confirm it no longer appears as outstanding.
8. Move the lead to `GOING_TO_BOOK`.
9. Select **Sale Made**, complete all Payment Card fields, and submit to Admin.
10. Confirm the submitted card is read-only and no duplicate Sale Made card can be created.
11. Check Notifications and Audit where your role permits.

Expected: no customer or payment-card information is re-entered unnecessarily, and Operations receives the submitted sale.

## S2 — Neglected and protected follow-up leads

1. Open the seeded Attention Lead: it has no meaningful activity for more than three days and no callback.
2. Confirm it appears in **Attention Leads** with an understandable reason.
3. Open the seeded Follow-Up/Callback lead with a valid future callback.
4. Confirm it is not incorrectly flagged only because earlier activity is old.
5. Ask the UAT Manager to reassign the Attention Lead and confirm the original/new owners see the correct result and notification.

Business decision: does the three-day rule match Neo Tourism practice? If not, record a `BUSINESS RULE ISSUE`; do not silently change it.

## S3 — Two-agent claim

1. Open the same Fresh Unassigned Lead in separate Sales 1 and Sales 2 sessions.
2. Attempt **Take Lead** at nearly the same time.
3. Confirm only one user receives the lead and the other receives a clear conflict message.
4. Confirm the losing user cannot edit the other agent's owned lead.

## S4 — Customer 360 after travel

1. Open Sarah Brown or the customer linked to the Closed Folder.
2. Confirm previous bookings, folder link, destination/travel history, leads, and notes are visible.
3. Confirm the customer is identifiable as a repeat customer without exposing unnecessary passenger details.

Ask: Is this enough when the customer contacts Neo Tourism again?

## Questions for Sales

- Was taking a lead easy and did ownership feel natural?
- Could you understand lead status quickly?
- Was customer information easy to find?
- Were notes, callbacks, and follow-ups easy to use?
- Was any information entered twice?
- Was the Payment Card missing information?
- Was Submit to Admin clear?
- Were reminders useful and correctly timed?
- What still requires email, WhatsApp, or Excel?
- What requires too many clicks?
