# Marketing UAT pack

Run the base seed, then run `npm run db:seed:uat` only against a database whose name contains `_uat`, with `APP_ENV=uat` and a strong `UAT_USER_PASSWORD`. The seed refuses all other environments and never prints the password.

Prepared accounts include Marketing User, Marketing Manager, Sales, Management and IT/Admin scenarios. Safe records are marked `[UAT TEST DATA]` and include Dubai Summer Offer, Dubai Summer Campaign, Dubai Instagram Reel and Ricky + Flip Test Reel.

Use [marketing-uat.md](marketing-uat.md), record findings in [marketing-issue-log.md](marketing-issue-log.md), and complete [marketing-signoff.md](marketing-signoff.md). Never enter real passenger, card, credential or provider-secret data.
