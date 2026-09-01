# Marketing architecture

## Shared record graph

`MarketingDeal → MarketingCampaign → MarketingContent → MarketingContentVersion → MarketingContentApproval → MarketingPublication`

Calendar events project Deal expiry, Campaign dates, Content deadlines, Publications, NeoTrio dates and external provider events. They do not copy those records.

`Website enquiry → Customer → Lead → MarketingAttribution → SaleSubmission → Booking`

Attribution optionally references the same Campaign, Deal, Content and Publication. Sales ownership does not move or delete attribution.

`MarketingSalesSignal / CRM trend → MarketingOpportunity → Campaign, Content, Deal, or NeoTrioIdea`

NeoTrio production links the same Campaign, Deal and NEO FLOW content. Greenlight remains its approval engine; Publication and Attribution remain its publishing and measurement records.

Relations use restrictive or set-null deletion behavior to retain history. Business lifecycle actions archive, expire, suspend or cancel records rather than deleting history.

Common high-volume predicates have composite indexes for status/date, assignment/stage and attribution entity/date access. Boards use bounded queries; queues and archives use pagination; dashboards run independent queries in parallel.
