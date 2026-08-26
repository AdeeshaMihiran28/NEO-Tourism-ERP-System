# NEO FLOW and NEO GREENLIGHT

Step 23B adds the visual creative workflow and version-specific approval process to the existing Marketing domain.

## Workflow controls

The active board stages are `IDEA → CREATING → REVIEW → READY → LIVE`. Generic metadata updates cannot change stage or approval state. Moving to REVIEW uses the dedicated submit action, which requires a current version and creates a pending approval for that exact version. Only the approval action can move REVIEW content to READY. Marking content LIVE requires READY stage and an approved current version.

When changes are requested, the approval record and submitted version remain preserved and content returns to CREATING. Rejected content returns to IDEA for deliberate replanning; it is not deleted. Each new creative revision creates a sequential immutable version. Adding a new version after READY/LIVE moves the item to CREATING and requires review again.

## File and preview foundation

Versions store file name, MIME type, storage key/URL, caption, copy, and notes. Binary data is not stored in PostgreSQL. Until secured object storage is configured, UAT should use non-sensitive metadata or placeholder storage references. Preview surfaces only the supported file metadata, caption, and copy.

## Deal-change protection

Material changes to a linked Deal Card do not rewrite creative assets. Connected READY/LIVE content is marked `reviewRequired`, records the changed fields and reason in audit history, and notifies its creator/assignee. Marketing then creates a new version and submits it through Greenlight.

## Publication truthfulness

LIVE represents the ERP's internal publication state only. It does not claim that Facebook, Instagram, email, paid-ad, NeoTrio, or website publishing occurred. `MarketingPublication` provides future channel/status metadata for NEO PLAN and provider integrations without fabricating external outcomes.

## Deferred scope

NEO PLAN, Meta APIs, paid-ad APIs, NEO SIGNAL analytics, attribution, NEO RADAR, NEO STUDIO, Character Vault, Neo Library, and Neo Performance remain out of scope.
