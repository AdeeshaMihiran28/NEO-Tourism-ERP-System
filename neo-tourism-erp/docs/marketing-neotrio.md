# NEO STUDIO — NeoTrio Creative Hub

NEO STUDIO manages ideas and production for Ricky, Flip and Oli while reusing the existing Marketing systems. It does not generate creative content and does not contain a second approval or attribution engine.

## Workflow and traceability

`NEO RADAR opportunity → NeoTrio idea → NeoTrio production → NEO FLOW content/version → NEO GREENLIGHT approval → NEO PLAN projection → publication → NEO LIBRARY → Marketing attribution → NEO PERFORMANCE`

Production stages are enforced by the backend: `IDEA → SCRIPT → PRODUCTION → REVIEW → READY → PUBLISHED`. READY is set only by an approved current NEO GREENLIGHT version. A Greenlight change request returns a REVIEW production to PRODUCTION. PUBLISHED is available only through the controlled publication endpoint; library creation is idempotent.

## Character Vault and files

Ricky, Flip and Oli are seeded without invented personality, appearance, voice, outfit, or backstory information. Empty guidance displays as “Not configured yet.” Official references are APPROVED assets only. New asset versions preserve their version group and never overwrite an earlier record.

The current storage contract accepts private storage metadata only. Storage keys must use the `neotrio/` namespace; MIME type, size, filename and authorization are validated. PostgreSQL stores no image/video binary and no storage credentials. `NEOTRIO_MAX_ASSET_BYTES` controls the metadata size limit.

## Analytics method

NEO PERFORMANCE reuses active Marketing Attribution records. Each content/lead pair is deduplicated. Selling value is counted only for attributed bookings. “Content Featuring Character” is non-additive: multi-character content appears in each featured-character row, so those rows must not be summed. “Exact Character Combination Performance” groups each production once by its exact relational character set. Series and format totals each count a production once.

External reach, views, impressions, clicks, or engagement are not fabricated. They are unavailable until verified provider metrics are synchronized.

## Permissions

Access uses the `marketing.neotrio.*` permission family. Controllers never check role names. Character asset approval is separate from asset upload, and performance/library access is independently grantable.
