# Marketing attribution rules

- **DIRECT** — explicit trusted business linkage.
- **TRACKED** — valid inbound campaign/deal/content/publication or UTM tracking.
- **MANUAL** — authorized, reasoned Marketing correction.
- **UNATTRIBUTED** — legitimate Lead with no valid tracking; CRM processing continues normally.

Invalid internal identifiers are not guessed or attached to a similar record. The integration follows controlled validation and records only validated relationships.

One active attribution may retain Campaign, Deal, Content, Publication, Lead, Customer, SaleSubmission and Booking references through the funnel. Performance deduplicates per entity/Lead pair.

- Quote stage: Lead currently reached QUOTING or has recorded transition evidence.
- Sale: Lead reached SALE_MADE.
- Booking: a Booking exists for the attributed Lead/SaleSubmission.
- Sales Contribution: Decimal-safe sum of attributed Booking selling values. It is not profit.
- Attribution Coverage: unique attributed Leads ÷ all Leads in the period × 100. Attributed and unattributed counts are shown separately.

Supplier cost, margin and profit are not Marketing metrics and require separate Finance authorization where available.
