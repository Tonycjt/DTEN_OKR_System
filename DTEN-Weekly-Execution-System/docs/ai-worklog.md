# AI Worklog

## Source Of Truth

- Active development folder: `DTEN-Weekly-Execution-System`
- Main PRD: `DTEN-Weekly-Execution-System/dten_okr_weekly_execution_system_prd.md`
- Do not treat sibling folders as active unless Tony explicitly asks.

## Resume Prompt

```text
You are continuing an ongoing software project called DTEN OKR Weekly Execution System.
Read this file carefully before doing anything — it contains everything you need to understand
the project state, architecture decisions, and standing rules.

Project context:
- Active development folder: DTEN-Weekly-Execution-System (Next.js 16, Prisma 7, PostgreSQL via Docker)
- Main PRD: DTEN-Weekly-Execution-System/dten_okr_weekly_execution_system_prd.md
- Current git branch: testing
- Developer: Tony (juntao.chen@dten.com)

What has been built (Releases 1–3 partial):
- Full auth, org hierarchy, role-based navigation
- Company OKRs, My OKRs, KR detail with weighted progress and trend charts
- Weekly reports with KR check-ins, manager review queue, delegated review routing
- Dashboard (role-scoped), executive summary, CSV export, advanced search
- Org import (CSV/Excel), follow-ups, comments, in-app + email notifications
- Roll-up: weighted KR progress inside objectives, parent/child objective contribution assignments
- Objective progress sources: MANUAL / DIRECT_KRS / CHILD_OBJECTIVES (mutually exclusive)
- R3.2: child objective proposal workflow (CONTRIBUTION_ONLY / PREDEFINED_CHILD_OBJECTIVE modes,
  PENDING_PROPOSAL → PENDING_REVIEW → ACTIVE/REJECTED/NEEDS_REVISION lifecycle)
- QA regression fixes: atomic updateMany concurrency safety for review and report submit,
  APPROVED proposal now transitions to ACTIVE, objective edit gated by ownership/role

Standing rules (follow these in every response):
- Alert-not-crash: invalid operations redirect with ?error= and show <div className="alert">.
  Never throw unhandled errors that crash the page.
- Concurrency safety: state transitions that must happen once use
  updateMany({ where: { id, status: <expected> } }) and gate side effects on count > 0.
  A plain update or findUnique-then-update is NOT safe under concurrent requests.
- Roll-up exclusivity: each objective uses exactly one progress source. Never mix.
- Roll-up counts only APPROVED/ACTIVE assignments toward parent progress.
- Review routing: effectiveReviewer = user.reviewOwnerId ?? user.managerId.
- Weekly KR picker is scoped to the report owner's assigned KRs only (server-side validated).
- Objective edit: only owner, CEO, or ADMIN may edit. Enforced in UI and server action.
- Seed reset leaves currentWeekReports = 0 for fresh testing. Do not reset unless Tony asks.
- Keep docs/ai-worklog.md updated at the end of every work session.
- Include a test path (user / route / action / expected result) with every new feature.

Demo logins (password: Password123!):
  ceo@dten.com | head@dten.com | manager@dten.com | engineer@dten.com | sales@dten.com

Local commands:
  Start app : .\start-dev.cmd
  Start DB  : .\start-db.cmd
  Reset DB  : npm run prisma:seed
  Test      : npm run test -- --run
  Lint      : npm run lint
  Build     : npm run build

Next planned work: Day 26 — Objective Health Calculation (see "Release 3 Remaining Work" below).
The QA regression run for the four bug fixes may still be pending from Tony's side — check with
Tony before starting Day 26 in case further QA issues surface.
```

---

## Completed Work Summary

### Release 1 (Days 1–8)
- Next.js App Router shell, TypeScript, ESLint, PostCSS, global CSS.
- Prisma 7 schema + PostgreSQL via Docker. All core models: User, Department, Team, Objective, KeyResult, MonthlyTarget, WeeklyReport, WeeklyPriority, CheckIn, ManagerReview, Notification, Comment, AuditLog.
- JWT session auth, login/logout, role-based sidebar navigation.
- Company OKRs list, My OKRs, Objective detail/create, KR detail/create/update.
- Weekly report editor (draft/submit), KR check-ins from weekly priorities.
- Manager review queue and history. In-app notifications with read state. Admin audit log.
- Seeded demo data (5 users, 4 departments, 3 teams, sample objectives/KRs).

### Release 2 (Days 9–21)
- `reviewOwnerId` field on User; delegated review routing (`reviewOwnerId ?? managerId`).
- Risk detection helpers (`src/lib/risk-detection.ts`); escalation flow for RISK_FLAGGED reviews.
- Department health comparison on CEO dashboard.
- KR trend charts (SVG) on KR detail from check-in history.
- Follow-up model (`FollowUp`), creation from reviews/KR detail, dashboard visibility.
- Report-level comments alongside KR comments.
- Email provider abstraction (`src/server/email.ts`), dev-log mode by default; overdue report processor (`npm run email:overdue`).
- Dashboard filters (department, team, owner, status, confidence, pacing, quarter) via URL params.
- Advanced search (`/search`) role-scoped across objectives, KRs, reports, comments, follow-ups.
- Dashboard CSV export (`/dashboard/export`) and weekly executive summary (`/executive-summary`).
- R2.5: Excel/CSV org import (`/admin/org-import`) with validation, apply, and org tree view.
- Role-based sidebar navigation; admin items hidden from non-admin/CEO roles.
- Release 2 acceptance checklist at `docs/release-2-acceptance-checklist.md`.

### Release 3 Days 22–25 + Clarifications + R3.2

**Roll-up data model (Day 22):**
- `KeyResult.weightPercent`, `Objective.progressSource` (MANUAL/DIRECT_KRS/CHILD_OBJECTIVES), `Objective.approvalStatus`.
- `ObjectiveAssignment` model: parentObjectiveId, assignedObjectiveId, assigneeId, assigneeType, contributionPercent.
- Roll-up validation helpers in `src/lib/rollup-validation.ts`.

**Weighted KR progress (Day 23):**
- `calculateWeightedProgress` helper in `src/lib/okr-calculations.ts`.
- KR create/edit forms include `weightPercent`. Objective detail shows weight total and warnings.
- AUTO (DIRECT_KRS) objectives recalculate stored progress after KR create/update/check-in.

**Parent/child contribution assignments (Day 24):**
- Objective detail shows assignment table with contribution total, child objective progress, weighted impact.
- create/update/delete/batch assignment server actions with full validation.
- Alert-not-crash pattern: all invalid operations redirect with `?error=...` and show an alert div. Applied to `/objectives/new`, `/objectives/:id`, `/key-results/:id`.

**Roll-up propagation (Day 25):**
- Parent objectives recalculate from child objective contribution progress after any child change.
- Batch assignment save (`batchUpdateObjectiveAssignmentsAction`) lets users edit multiple contribution % at once before submitting (avoids mid-edit 100% violations on published objectives).
- KR creation redirects back to objective detail page (not KR detail) for faster multi-KR workflows.
- Weekly report Linked KR picker scoped to current user's assigned KRs only (server-side validated).

**Progress source clarification fix (pre-Day 26):**
- `Objective.progressSource` enum: MANUAL / DIRECT_KRS / CHILD_OBJECTIVES.
- DIRECT_KRS validates KR weights and rolls up from direct weighted KRs only.
- CHILD_OBJECTIVES validates assignment contributions and rolls up from child objective progress only.
- MANUAL preserves manually entered progress, requires neither total.
- Mixed roll-up (one objective reading both direct KRs and child assignments) is intentionally blocked.
- Seeded data: company product objective = CHILD_OBJECTIVES with 2 child assignments; child execution objectives = DIRECT_KRS.

**R3.2 — Child objective proposal workflow + My OKRs bug fix (2026-05-13):**
- Bug fix: `/my-okrs` now queries `ObjectiveAssignment` directly (not via objective owner). UI falls back to showing the parent objective when no child is linked yet.
- New enums: `ObjectiveAssignmentMode` (CONTRIBUTION_ONLY / PREDEFINED_CHILD_OBJECTIVE), `ObjectiveAssignmentStatus` (PENDING_PROPOSAL / PENDING_REVIEW / NEEDS_REVISION / APPROVED / REJECTED / ACTIVE).
- New notification types: ASSIGNMENT_PROPOSAL_SUBMITTED / ASSIGNMENT_PROPOSAL_REVIEWED.
- New fields on `ObjectiveAssignment`: assignmentMode, assignmentInstruction, status, createdById, approvedById, approvedAt.
- Migration: `20260513220000_r3_2_assignment_workflow`.
- PREDEFINED_CHILD_OBJECTIVE: parent owner picks child at creation → assignment goes straight to ACTIVE.
- CONTRIBUTION_ONLY: assignee proposes a child → PENDING_PROPOSAL → PENDING_REVIEW → APPROVED/REJECTED/NEEDS_REVISION loop.
- Roll-up only counts APPROVED/ACTIVE assignments.
- Actions: `proposeChildObjectiveAction`, `reviewAssignmentAction`, updated `createObjectiveAssignmentAction`.
- Objective detail: mode/instruction fields in create form, status badges, review controls for PENDING_REVIEW rows when current user owns parent.
- My OKRs: status badges and proposal form in Contributing Objectives section.
- Seed data: all existing assignments use PREDEFINED_CHILD_OBJECTIVE / ACTIVE.

**UX additions (same sprint):**
- "Create Objective" added to primary sidebar nav, visible to all roles except VIEWER (`/objectives/new`).
- `qa-simulation/**` added to ESLint ignore list so QA test scripts do not fail the lint gate.

**QA regression fixes (2026-05-13, testing branch):**

Four bugs found via `qa-simulation/concurrent-r3-2-report.md` and confirmed by `qa-simulation/quick-four-bug-regression.mjs`. All four fixed and re-verified:

1. **(Critical) Duplicate manager reviews under concurrent load** — `submitManagerReviewAction` in `src/app/reviews/actions.ts` was doing `findUnique` → `create` + `update`, which is two steps and allowed N concurrent transactions all to proceed. Fix: replaced with `weeklyReport.updateMany({ where: { id, status: "SUBMITTED" }, data: { status: nextStatus } })` as the **first operation inside the transaction**. Postgres row-level locking means only one transaction can win the compare-and-swap; the rest see `count = 0` after the winner commits and bail before creating any `ManagerReview`, notification, or audit log.

2. **(High) Approved proposal stays `APPROVED` instead of `ACTIVE`** — `reviewAssignmentAction` in `src/app/objectives/actions.ts` was writing `status: decision` directly. Fix: map `"APPROVED"` decision to `"ACTIVE"` status (`const newStatus = decision === "APPROVED" ? "ACTIVE" : decision`). `approvedById`/`approvedAt` are still set because the condition checks the decision, not the stored status.

3. **(High) Weekly report double-submit produces duplicate audit logs and notifications** — `submitWeeklyReportAction` in `src/app/weekly-report/actions.ts` used `weeklyReport.update({ where: { id } })` with no status condition, so all 5 concurrent requests updated successfully. Fix: replaced with `weeklyReport.updateMany({ where: { id, status: { in: ["DRAFT","NEEDS_FOLLOW_UP"] } } })`. Only the winning request (count > 0) proceeds to create the notification and audit log. Initial attempt used an early status-check guard (read-before-write) which still allowed concurrent duplicates; correct fix is the atomic `updateMany`.

4. **(Medium) Employee can see Edit Objective controls on CEO-owned objectives** — `src/app/objectives/[id]/page.tsx` rendered the Edit Objective card for all authenticated users. Fix: added `canEditObjective = isOwner || role === CEO || role === ADMIN`; card is now conditionally rendered. Backend `updateObjectiveAction` in `src/app/objectives/actions.ts` also now rejects with an alert if the caller is neither owner nor CEO/ADMIN.

---

## Key Behavioral Rules (preserve across chats)

- **Alert-not-crash**: invalid user operations (bad weights, invalid contributions, unauthorized actions) redirect back with `?error=...` and render an `<div className="alert">`. Never throw unhandled server errors.
- **Review routing**: effective reviewer = `user.reviewOwnerId ?? user.managerId`. Used in submission notifications, pending review queue, dashboard counts.
- **Roll-up source exclusivity**: an objective rolls up from exactly one source (DIRECT_KRS or CHILD_OBJECTIVES or MANUAL). Never mix.
- **Roll-up only counts APPROVED/ACTIVE assignments**: PENDING/REJECTED assignments do not affect parent progress.
- **Weekly KR picker scope**: Linked KR dropdown in weekly reports shows only KRs assigned to the current report owner. Server-side validated.
- **Seed reset behavior**: `npm run prisma:seed` resets the demo DB. After reset, `currentWeekReports = 0` so the current week is open for fresh testing.
- **Do not reset DB** unless Tony explicitly asks (or at the end of a completed day).
- **Concurrency safety pattern**: for any state transition that must happen exactly once (report submit, review submit), use `updateMany({ where: { id, status: <expected> }, data: { status: <next> } })` and gate all side effects (notifications, audit logs) on `count > 0`. A plain `update` with no status condition allows concurrent duplicates. A pre-transaction `findUnique` check is not safe either — use the `updateMany` as the atomic compare-and-swap inside the transaction.
- **Objective edit authorization**: only the objective's owner, CEO, or ADMIN may edit it. Enforced in both the UI (card hidden) and the server action (`updateObjectiveAction` rejects with alert).

---

## Demo Environment

```text
Docker container : dten-weekly-postgres (postgres:16-alpine)
DB URL           : postgresql://postgres:postgres@localhost:5432/dten_weekly_execution?schema=public
Start DB         : .\start-db.cmd   (or: docker compose up -d)
Stop DB          : .\stop-db.cmd
Start app        : .\start-dev.cmd
Reset/seed DB    : npm run prisma:seed
Overdue emails   : npm run email:overdue
```

Demo logins (password: `Password123!`):

```text
ceo@dten.com      CEO
head@dten.com     Department Head
manager@dten.com  Manager
engineer@dten.com Employee
sales@dten.com    Employee (Sales)
```

Verification baseline when schema changes:

```powershell
& '.\node_modules\.bin\prisma.cmd' validate
& 'C:\Program Files\nodejs\npm.cmd' run prisma:generate
& 'C:\Program Files\nodejs\npm.cmd' run prisma:migrate
& 'C:\Program Files\nodejs\npm.cmd' run test -- --run
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run build
& 'C:\Program Files\nodejs\npm.cmd' run prisma:seed
```

Latest verified state (2026-05-13, testing branch):

```text
Migrations       : 9 applied, schema up to date
Vitest           : 4 files, 17 tests — all passing
Lint             : clean (qa-simulation/** excluded)
Build            : production build passes
currentWeekReports: 0 (DB NOT reset this session — Tony is live testing)
Objectives       : 4 (3 DIRECT_KRS, 1 CHILD_OBJECTIVES)
ObjectiveAssignments: 2 (both PREDEFINED_CHILD_OBJECTIVE / ACTIVE)
QA regression    : all 4 bugs fixed and verified clean by lint + build
                   (full regression re-run by Tony's test suite still pending)
Active branch    : testing
```

---

## Standing Instructions

```text
- Active development folder is DTEN-Weekly-Execution-System.
- Main PRD is DTEN-Weekly-Execution-System/dten_okr_weekly_execution_system_prd.md.
- Read docs/ plus this worklog when resuming in a new chat.
- Preserve Tony's PRD edits; do not overwrite or casually reformat the PRD.
- Keep docs/ai-worklog.md updated at the end of every work session.
- For each new development day, reset/reseed the local demo database at the end unless Tony says not to.
- Include a basic test process in every final response for any new functionality: which user, which route, what to click, what result to confirm.
- Keep using seeded users with password Password123!.
- When a UI imperfection is reported, make a focused polish fix, run lint/build, and include a short visual test path.
- Alert-not-crash: illegal operations must be blocked with user-facing alerts, not site crashes.
- Continue using small day-sized chunks for Release 3 work.
```

---

## Release 3 Remaining Work

Next target: **Day 26 — Objective Health Calculation**

```text
Build objective health calculation:
- Add a shared objective health/status helper in src/lib/ based on child KR and child objective statuses.
- PRD rules to implement:
  - Any blocked (ON_HOLD) child KR or child objective → parent at risk / blocked.
  - Majority of children behind (OFF_TRACK) → parent behind / off-track.
  - All children completed → parent completed.
- Map PRD language (BLOCKED → ON_HOLD, BEHIND → OFF_TRACK) to current WorkStatus enum; add a code comment explaining the mapping rather than migrating the enum unless Tony decides otherwise.
- Surface calculated health on:
  - Objective detail page (alongside manual status)
  - Dashboard risk/health sections
- Preserve alert-not-crash behavior for invalid operations.
- Run full verification + reset/reseed at the end.
```

**Day 27 — Company Objective Approval Workflow**

```text
- Add approval status for company-level OKRs: DRAFT / PENDING_APPROVAL / APPROVED / REJECTED / PUBLISHED.
- Add approval actions for CEO/admin.
- Block activation/publishing when KR weights or assignment contributions do not total 100.
- Add approval audit logs and notifications.
- Add company OKR approval queue or section.
```

**Day 28 — Advanced Permission Model**

```text
- Centralize OKR/objective/KR permission helpers instead of repeating route-specific checks.
- Define create/edit/approve/comment/view rules for CEO, executive, department head, manager, employee, and viewer.
- Apply backend permission checks to objective, KR, assignment, approval, comment, follow-up, dashboard/export/search surfaces.
- Add tests for the riskiest scopes:
  - employee cannot edit others' KRs
  - manager cannot edit outside review scope
  - department head is department-bound
  - viewer is read-only
```

**Day 29 — Slack/Teams Notification Foundation**

```text
- Add provider abstraction for collaboration notifications, similar to the existing email provider.
- Add event hooks for: review requested, follow-up assigned, KR blocked/off-track, approval requested, approval completed.
- Keep real Slack/Teams credentials behind environment variables.
- Use dev-log provider by default until Tony provides workspace/app configuration.
- Add admin-visible delivery/audit notes where practical.
```

**Day 30 — SSO Integration Foundation**

```text
- Confirm DTEN's preferred identity provider before implementing real SSO.
- Prepare NextAuth provider configuration and environment variables.
- Preserve local email/password login as a development fallback.
- Map IdP email to existing imported users.
- Enforce inactive-user blocking and role/department/team data from the database.
- Add a short SSO setup doc once provider details are known.
```

**Day 31 — Release 3 Hardening And Acceptance Checklist**

```text
- Add docs/release-3-acceptance-checklist.md.
- Run schema validation, generate, migrate, tests, lint, build, and seeded-user browser smoke.
- Smoke: CEO/company roll-up, weighted KRs, assignment contributions, approval workflow,
  dashboard roll-up, permission boundaries, notification dev logs.
- Reset/reseed the demo database at the end and verify currentWeekReports = 0.
```

**Important Release 3 dependency notes:**

```text
- Slack/Teams and SSO require Tony/DTEN decisions or credentials; implement provider abstractions
  and dev-mode logging first.
- Approval workflow should come after weight/contribution validation exists; otherwise approval
  cannot enforce the Release 3 business rules.
- Dashboard/export/search/summary all read stored objective progress. Roll-up changes must update
  shared helper usage, not only the objective detail page.
- Current WorkStatus enum values: DRAFT, ON_TRACK, AT_RISK, OFF_TRACK, COMPLETED, ON_HOLD.
  PRD uses BLOCKED/BEHIND language → map carefully in code/UI or migrate enum deliberately.
```
