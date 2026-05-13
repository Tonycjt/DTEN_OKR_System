# Release 2 Acceptance Checklist

Release 2 goal:

```text
Improve the system from basic tracking to smarter execution visibility.
```

## Definition Of Done

| # | PRD Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Company structure supports delegated review ownership. | Done | `users.reviewOwnerId`, review owner forms, review routing helpers, and seeded review owners. |
| 2 | Weekly reports route to the correct review owner with manager fallback. | Done | `reviewQueueWhere`, `canReviewOwnedReport`, weekly report submit notifications, and pending review scope. |
| 3 | CEO is not required to review every employee report. | Done | CEO dashboard shows aggregate health, direct review work, missing updates, and escalations instead of all reports as direct approvals. |
| 4 | Escalated risks appear above the direct manager level. | Done | Risk-flagged manager reviews notify escalation owners and appear in dashboard escalation sections. |
| 5 | Better risk detection is available. | Done | Shared KR risk detection covers pacing, status, low confidence, blockers, missing updates, and due-date risk. |
| 6 | Department health comparison exists. | Done | Dashboard Department Health compares objectives, KRs, confidence, review flow, missing updates, and escalations. |
| 7 | KR trend tracking exists. | Done | KR detail shows progress, confidence, and status history from check-ins. |
| 8 | Follow-up items can be created and tracked. | Done | Follow-ups exist from KR detail and review queues, with owner, assigner, due date, and status updates. |
| 9 | Comment threads exist on KRs and reports. | Done | KR comments and report comments create notifications and audit logs. |
| 10 | Email notification foundation exists. | Done | Dev-log email provider and event helpers cover review requested, follow-up assigned, overdue reports, and KR blocked. |
| 11 | Advanced dashboard filters exist. | Done | Dashboard URL filters support department, team, owner, status, confidence, pacing, and quarter. |
| 12 | Advanced search exists. | Done | `/search` covers OKRs/KRs, reports, comments, and follow-ups with role scoping. |
| 13 | Dashboard CSV export exists. | Done | `/dashboard/export` exports visible filtered objectives, KRs, risks, and reports. |
| 14 | Weekly executive summary exists. | Done | `/executive-summary` shows visible users, review completion, missing updates, risks, escalations, and department snapshots. |
| 15 | Excel / CSV organization import exists. | Done | `/admin/org-import` supports CSV/TSV upload and Excel paste. |
| 16 | Organization import validates required fields, duplicate emails, references, and circular relationships. | Done | `src/lib/org-import.ts` validation plus focused unit tests in `src/lib/org-import.test.ts`. |
| 17 | Organization import applies users, departments, teams, managers, review owners, inactive status, and audit logs. | Done | Transactional import action creates/updates by email and writes audit logs. |
| 18 | Organization tree displays imported reporting relationships. | Done | `/admin/org-import` renders a database-generated organization tree with missing reviewer warnings. |

## Day 21 Verification

```powershell
docker compose up -d
& '.\node_modules\.bin\prisma.cmd' validate
& 'C:\Program Files\nodejs\npm.cmd' run prisma:generate
& 'C:\Program Files\nodejs\npm.cmd' run prisma:migrate
& 'C:\Program Files\nodejs\npm.cmd' run test -- --run
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run build
& 'C:\Program Files\nodejs\npm.cmd' run prisma:seed
```

Browser smoke coverage:

```text
- CEO routes: dashboard, filtered dashboard export, executive summary, search, org import, audit log.
- Manager routes: dashboard, pending reviews, review history, executive summary, search.
- Engineer routes: dashboard, current weekly report, report history, KR detail/comment visibility.
- Sales route scope: search should not expose Product Engineering-only D7X data.
- Org import desktop and mobile visual pass.
```

Result:

```text
Release 2 smoke passed.
```
