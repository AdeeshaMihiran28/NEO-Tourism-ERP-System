# Marketing integrations

## Website — NOT_CONFIGURED

No real local outbound website endpoint/token is configured. Required activation values are a webhook secret for inbound enquiries and the approved Deal API base URL/token for outbound Deal publication/removal. Supported internal actions are tracked enquiry ingestion and configured Deal removal. Unsupported without provider setup: verified website publication and unpublication. Failures create IntegrationEvent evidence and never roll back internal state. Secrets must remain in environment/secret storage and are never audited or documented.

## Meta Business Suite — NOT_CONFIGURED

No real local credentials are configured. Activation requires App ID, App Secret, access token, Facebook Page ID and/or Instagram Business Account ID plus appropriate read permissions. Current support is safe status/read sync into idempotent ExternalMarketingEvent records. Automated tests use the mock adapter only. The ERP does not claim live publishing, ads management, reach or engagement when unavailable.

Meta or website failure does not disable Launch, Flow, Greenlight, Plan, Pulse, Signal, Radar or Studio. Provider status is one of NOT_CONFIGURED, CONNECTED, DEGRADED, ERROR or DISABLED, based on real configuration and outcomes.
