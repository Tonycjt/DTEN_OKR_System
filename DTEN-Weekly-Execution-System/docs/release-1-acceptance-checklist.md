# Release 1 Acceptance Checklist

Release 1 goal:

```text
Objective -> KR -> Weekly Priority -> Check-in -> Manager Review -> Dashboard
```

## Definition Of Done

| # | PRD Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Users can log in. | Done | Local email/password login, logout, and `/api/auth/me`. |
| 2 | Admin can create org hierarchy. | Done | `/admin/users`, `/admin/departments`, `/admin/teams` create and edit flows. |
| 3 | Objectives and KRs can be created and viewed. | Done | `/company-okrs`, `/my-okrs`, `/objectives/new`, `/objectives/:id`, `/key-results/:id`. |
| 4 | KRs can have monthly targets. | Done | KR create and edit forms store M1/M2/M3 target values and percents. |
| 5 | Employees can submit weekly reports. | Done | `/weekly-report/current` draft, priority, check-in, submit flow. |
| 6 | Weekly priorities can link to KRs. | Done | KR-linked priorities require a selected KR before submit. |
| 7 | Check-ins update KR progress. | Done | Weekly report check-in updates current value, progress, confidence, status, and pacing. |
| 8 | Pacing is calculated from monthly targets. | Done | Shared pacing helper applies NO_TARGET, NO_UPDATE, ON_PACE, and BEHIND. |
| 9 | Managers can review submitted reports. | Done | `/reviews/pending` and `/reviews/history` with review decision and comments. |
| 10 | CEO dashboard shows company OKR health and risk items. | Done | `/dashboard` shows company health, KR status/pacing, confidence, missing reports, and risk KRs for CEO/admin. |
| 11 | Basic permissions are enforced by backend. | Done | Auth-required app shell, role-guarded admin/review/audit routes, ownership checks on weekly report mutations. |
| 12 | Seed data allows demo of the full workflow. | Done | Seeded CEO, department head, manager, employees, org hierarchy, objectives, KRs, targets, report, priority, check-in, review, notification, comment, and audit logs. |

## Day 8 Verification

```powershell
docker compose up -d
& '.\node_modules\.bin\prisma.cmd' validate
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run build
```

Browser smoke coverage:

```text
- CEO login and desktop routes: dashboard, company OKRs, objective creation, notifications, admin users, departments, teams, audit log.
- Objective detail route from company OKR list.
- Manager login and desktop routes: dashboard, pending reviews, review history, notifications.
- Engineer login and desktop routes: dashboard, my OKRs, current weekly report, weekly report history, notifications.
- Mobile routes at 390px width: dashboard, current weekly report, notifications.
- Horizontal overflow check on each route.
```

Result:

```text
Release 1 smoke passed.
```
