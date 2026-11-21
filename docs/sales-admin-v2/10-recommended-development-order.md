# Recommended development order

This order minimizes parallel models and keeps the existing handover usable after each stage.

1. **Confirm business vocabulary and state machines.** Approve updated lead statuses, Marketing Medium taxonomy, product types/statuses, deposit authority, Admin reject/return semantics, deadlines, cancellation rules and checklist ownership.
2. **Design one product aggregate.** Add a single Sale/Booking product design that can move through handover; decide whether the product is created under the submission and promoted/copied to the booking. Do not create unrelated per-product tables first.
3. **Extend Sales capture.** Structured medium, quotation(s), product lines, supplier/reference capture, Payment Card V2, installments and deposit request/approval, while retaining the existing unique Lead-to-SaleSubmission rule.
4. **Complete Admin review.** Add reject/return-with-reason and a clear resubmission transition before expanding automatic booking creation.
5. **Extend booking handover.** Carry accepted products, supplier links, references and passenger requirements into the existing Booking; keep Customer/Lead/SaleSubmission foreign keys unchanged.
6. **Add secure attachment transport.** Reuse `BookingDocument` metadata but add an authorized upload/download storage boundary before screenshot paste or payment evidence UI.
7. **Add product-level Operations.** Product statuses, schedule changes, deadlines, reminders, confirmations, ticket issuance and special requests, reusing booking tasks/references/documents where they already express the concept.
8. **Extend finance, not replace it.** Link installments, evidence, vouchers, product revenue/cost/surcharge and supplier obligations to existing payments, adjustments, invoices, FX, GL and reconciliation services.
9. **Add Admin verification.** Keep it distinct from financial reconciliation, but reuse common evidence/reference/task records. Define who can attest each item and whether reopening invalidates attestations.
10. **Integration and release hardening.** Connect all new backend paths to frontend permissions, add focused unit/E2E coverage, fix current lint debt, run the complete suite against an isolated database, then perform role-based browser acceptance tests.

## First safe development slice

The smallest coherent slice is: confirmed product/status vocabulary -> structured Sale product(s) -> Payment Card V2 draft -> Admin review including return -> accepted handover into Booking product(s). It delivers the central workflow before deadlines, evidence and finance extensions depend on it.
