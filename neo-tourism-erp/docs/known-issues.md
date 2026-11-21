# Known issues

This register covers issues known at the 2026-08-23 internal QA handover. P0 blocks all testing; P1 blocks the main journey or creates an unacceptable security/data-integrity risk; P2 has a usable workaround or affects a secondary workflow; P3 is low-impact polish.

## Open P0

None.

## Open P1

None.

## Open P2

| ID | Area | Issue / impact | Workaround or next action |
|---|---|---|---|
| QA-201 | Browser QA | Interactive desktop, narrow-viewport, keyboard, refresh and console testing was not run. Chrome and Edge are installed, but the 2026-08-24 assessment found no ChatGPT browser extension/native-host connection, so automated browser control was unavailable. | Install/re-enable the ChatGPT browser extension connection if automated assessment is required, or have internal testers run the manual matrix using extension-free Chrome and Edge profiles. |
| QA-202 | Dependencies | `npm audit --omit=dev` reports 3 high advisories for `deepmerge-ts` through `@prisma/config`/Prisma CLI. npm proposes a breaking Prisma 7-to-6 downgrade. | Do not run `npm audit fix --force`. Track an upstream Prisma-compatible fix and restrict Prisma CLI/config execution to trusted development and deployment inputs. |
| QA-203 | Administration UI | Users, departments, roles and permissions have protected backend APIs but no complete frontend management screens. | Use seeded roles for internal QA; administer through reviewed API/database procedures only when necessary. |
| QA-204 | Booking documents | Booking and HR documents store metadata/URLs; binary upload, malware scanning, object storage and retention are not implemented. | Use non-sensitive placeholder URLs during internal QA. Design secure document storage before production. |
| QA-205 | HR configuration UX | Launch workflows and employee views are present, while advanced policy/template/custom-field configuration remains API-first. | HR UAT may use the permission-controlled API for configuration; add richer administration screens as later usability work. |
| QA-206 | IT UI | Ticket assignment, full status transitions and ticket detail/activity management are not complete frontend workflows. | IT staff can use the implemented create/list/resolve foundation; complete the management UI before operational rollout. |
| QA-207 | Pagination | `/users` is capped at 500. Some secondary HR/IT and booking-child collections use caps rather than consistent page/limit pagination. | Acceptable for the small QA dataset; implement cursor/page pagination before volumes approach caps. |
| QA-208 | Date/time display | The UI uses browser-local formatting and has no user-configurable business timezone. Date-only values may display differently for users outside the intended timezone. | Test in Asia/Colombo; define organization/user timezone behavior before multi-timezone use. |
| QA-209 | Integrations | Wise and PBX adapters are preparation layers and are not connected to live providers. | Keep disabled/not configured. Complete provider sandbox, signature, timeout, retry and reconciliation acceptance tests separately. |

## Open P3

| ID | Area | Issue / impact | Next action |
|---|---|---|---|
| QA-301 | Supplier editing | Supplier creation/listing is available in the booking UI, while correction uses the protected backend update endpoint. | Add a permission-aware edit form with confirmation and audit context. |
| QA-302 | Automated UI coverage | There is no committed browser E2E suite for navigation, forms and responsive regressions. | Add Playwright coverage for login and the main role journeys when the UI stabilizes. |

## Explicitly not implemented

- Real legacy CRM migration or production-data import
- Production hosting, CI/CD and managed secrets
- MFA/SSO, token revocation/rotation and password-reset workflow
- Deployment-tested CSP and multi-instance edge throttling
- Live Wise, PBX, email, SMS or bank integrations
- Binary document storage, antivirus scanning and formal retention/deletion automation
- Centralized monitoring, alerting, tamper-resistant audit export and disaster-recovery implementation

These are production-readiness items, not hidden defects in the controlled internal QA scope.

## Acceptance gates (not defect IDs)

As of 2026-08-24, UAT has not started. Sales, Admin / Operations, Accounts, HR, IT, and Management are all `NOT TESTED`; no representative or overall owner has signed. There are zero submitted UAT issues at every priority because no feedback has been supplied, not because acceptance found no defects. See `uat/uat-progress.md`.

The Chrome/Edge 1920x1080 and 1366x768 matrix is also open. The assessment session exposed no controllable browser, so `QA-201` remains unresolved. These acceptance gaps block pre-production technical handover without being misclassified as product defects.
