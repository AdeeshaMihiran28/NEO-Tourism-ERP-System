# Marketing permissions

Controllers require permission codes and do not hardcode role names.

| Area | Permission families |
|---|---|
| Command hub | `marketing.pulse.view`, `marketing.alert.view`, `marketing.workload.view` |
| Deals | `marketing.deal.view/create/edit/submit/approve/schedule/publish/suspend`, `marketing.deal.channel.manage`, `marketing.deal.sales_view` |
| Content | `marketing.content.view/create/edit/assign/version.create/submit_review/publish/comment` |
| Greenlight | `marketing.approval.view/approve/request_changes/reject` |
| Plan | `marketing.calendar.view/create/edit/reschedule` |
| Signal | `marketing.signal.view/management`, `marketing.attribution.view/manage/override` |
| Radar | `marketing.radar.view`, `marketing.opportunity.view/create/manage`, Sales-signal permissions |
| Studio | `marketing.neotrio.*` create/view/edit/manage/assign/upload/approve/library/performance permissions |

Sales receives approved-offer view and signal creation only where granted. Management analytics access does not imply editing. Character asset approval is separate from upload. Manual tracked-attribution replacement needs explicit override permission and a documented reason. Finance details remain controlled by Finance permission independently of Marketing access.

UAT uses Marketing User, Marketing Manager, Sales, Management and IT/Admin scenarios rather than Super Admin for normal tests.
