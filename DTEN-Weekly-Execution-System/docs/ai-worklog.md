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

R3.4 fully complete (including R3.4.11 My Team tree + R3.4.12 Draft/Publish workflow). DB migrated (all migrations applied). Reseed: npm run prisma:seed
Latest additions: Objective draft/publish inline-error form, My Team sidebar with hasDirectReports gate, merged My OKRs table.
Resume prompt next: verify R3.4 DOD checklist on live app, or continue to R3.5.
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

### R3.3 — Weekly Planning vs Weekly Reporting (2026-05-14)

**Schema changes:**
- `WeeklyPriority` gains `userId`, `weekStartDate`, `carriedOverFromId` (self-referential).
- `weeklyReportId` made nullable (`SetNull` on report delete); was `Cascade`.
- New indexes: `(userId, weekStartDate)`, `carriedOverFromId`.
- Migration: `20260514000000_r3_3_weekly_planning` (includes SQL backfill from WeeklyReport).

**New `/weekly-plan` page:**
- Standalone priority planning UI (before the report exists).
- Shows last week's incomplete priorities with "Carry Over to This Week" button.
- Add/edit/delete priorities; linked KR picker scoped to owner's assigned KRs.
- Actions: `createPlanPriorityAction`, `updatePlanPriorityAction`, `deletePlanPriorityAction`, `carryOverPriorityAction`.
- Carry-over deduplication: checks for existing `carriedOverFromId` match for same week.

**Modified `/weekly-report/current` page (three clear sections):**
- **Plan** — read-only summary of planned priorities; link to `/weekly-plan` to edit.
- **Report** — status, result summary, blocker, next step per priority (actual vs planned).
- **KR Check-ins** — explicit KR value/confidence/status updates (only KR-linked priorities).
- Summary + Submit unchanged (bottom of page).

**Auto-linking in `ensureCurrentWeeklyReport`:**
- After upsert, runs `updateMany({ weeklyReportId: null, userId, weekStartDate })` to link any
  standalone planned priorities to the report when user first opens the report page.

**New action `saveReportPriorityAction`:**
- Updates the reporting fields (status, resultSummary, blocker, nextStep, linkedKeyResultId).
- Replaces the old `updateWeeklyPriorityAction` on the report page.

**Standing rules preserved:**
- Alert-not-crash, concurrency safety, KR picker scoped to owner, no direct progress update without check-in.

**Routes:** Added "Weekly Plan" (`/weekly-plan`, CalendarDays icon) before "Weekly Report" in sidebar.

### R3.4 Chunk A — Navigation + Child Objective Cleanup + My OKR Refactor (2026-05-14)

**Updated `src/lib/routes.ts`:**
- New `NavItem` discriminated union type: `{ kind: "link" }` and `{ kind: "group" }`.
- Sidebar now has three primary items: Dashboard / OKR group (Company OKRs, My OKRs, Create Objective) / Weekly Report.
- Weekly Plan, Reviews, Summary, Search, Notifications removed from primary sidebar (accessible via URLs and page links).
- Used `LucideIcon` type to avoid TypeScript Booleanish incompatibility.

**Updated `src/components/layout/sidebar.tsx`:**
- Renders groups with a header + indented child links using `.nav-group` / `.nav-group-header` / `.nav-link-child`.

**Updated `src/app/globals.css`:**
- Added `.nav-group`, `.nav-group-header`, `.nav-link-child` styles.

**Updated `src/app/objectives/[id]/page.tsx`:**
- Removed "Objective Contributions" card (R3.2 assignment workflow) entirely.
- Removed `parentObjectives` query, `parentObjectiveId` field from edit form.
- Removed now-unused imports: `batchUpdateObjectiveAssignmentsAction`, `createObjectiveAssignmentAction`, `deleteObjectiveAssignmentAction`, `reviewAssignmentAction`, `validateObjectiveAssignmentContributions`.
- `CHILD_OBJECTIVES` removed from progress source dropdown.

**Updated `src/app/objectives/new/page.tsx`:**
- Removed parent objective picker. Objectives are now parallel.
- `CHILD_OBJECTIVES` removed from progress source dropdown. Default is `DIRECT_KRS`.

**Updated `src/app/my-okrs/page.tsx`:**
- Removed "Contributing Objectives" section (R3.2 assignment-based).
- Added "Objectives via Assigned KRs" table for objectives where user owns ≥1 KR but not the objective.
- OWNER badge on owned objectives; ASSIGNED KR badge on assigned-KR objectives.
- Monthly targets column added to Assigned KRs table.

**Verification:** lint clean, production build passing (25 routes, TypeScript clean).

### R3.4 — Objective Health Calculation (2026-05-14)

**New `src/lib/objective-health.ts`:**
- `calculateObjectiveHealth(childStatuses: WorkStatus[]): ObjectiveHealthResult` — pure function.
- Rules (PRD language mapped to WorkStatus enum):
  - Any child `ON_HOLD` (PRD: BLOCKED) → computed `AT_RISK`.
  - All children `COMPLETED` → computed `COMPLETED`.
  - Majority children `OFF_TRACK` (PRD: BEHIND) → computed `OFF_TRACK`.
  - Any child `AT_RISK` → computed `AT_RISK`.
  - No signal → `null` (advisory only; objective's stored status is still set manually).
- `getObjectiveChildStatuses(objective)` — selects the right child list based on `progressSource`:
  - `DIRECT_KRS` or `MANUAL`: uses KR statuses.
  - `CHILD_OBJECTIVES`: uses only `ACTIVE` / `APPROVED` assignment child objective statuses.

**New `src/lib/objective-health.test.ts`:** 15 tests covering all health rules and child status selection.

**Objective detail page (`/objectives/:id`):**
- Added "Computed Health" row to the Objective Summary card, showing computed status badge + reason string, or "No health signal from children" when null.

**Dashboard (`/dashboard`):**
- New `objectivesForHealth` query (up to 20 non-completed objectives in scope, with KR statuses and active/approved assignment child statuses).
- New "Objective Health" card shows objectives where computed health is `AT_RISK` or `OFF_TRACK`, with owner, progress source, child count, and reason.
- Placed between Risk Items and Escalations cards.

**No schema changes.** No migration required.

**Verification:** 32 tests passing, lint clean, production build passing (25 routes).

### R3.4 Chunk B — KR Assignment Org Scope + Company Tree View (2026-05-14)

**New `src/lib/org-scope.ts`:**
- `getAssignableUsers(actorId, role)` — returns users within the actor's org scope:
  - CEO/ADMIN/EXECUTIVE → all active users.
  - DEPARTMENT_HEAD → all active users in same department.
  - MANAGER → actor + transitive direct reports (iterative BFS via `managerId`).
  - EMPLOYEE/VIEWER → self only.
- `buildSubtree(rootId, users)` — returns Set of user IDs in reporting subtree (root included).
- `isInAssignableScope(actorId, role, targetUserId)` — fast-path check; CEO/ADMIN/EXECUTIVE always true.

**Updated `src/app/objectives/[id]/page.tsx`:**
- `users` query replaced with `getAssignableUsers(currentUser.id, currentUser.role)`.
- KR owner picker and edit-objective owner picker now show only within-scope users.

**Updated `src/app/key-results/[id]/page.tsx`:**
- `users` query replaced with `getAssignableUsers(currentUser.id, currentUser.role)`.
- KR update owner picker and follow-up owner picker now show only within-scope users.

**Updated `src/app/objectives/actions.ts`:**
- Added `isInAssignableScope` import.
- `createKeyResultAction`: validates `ownerId` is within actor scope before KR creation.
- `updateKeyResultAction`: validates `ownerId` is within actor scope before KR update.

**New `src/app/company-tree/page.tsx`:**
- Org tree view: Company objectives → Department cards (with team subsections) → Individual objectives.
- Uses `route-grid` / `route-item` layout; shows owner, KR count, status badge, progress bar per objective.
- Accessible to CEO, EXECUTIVE, DEPARTMENT_HEAD, MANAGER, VIEWER.

**Updated `src/lib/routes.ts`:**
- Added "Company Tree" (`/company-tree`, `Building2` icon) to OKR group between Company OKRs and My OKRs.

**Updated `src/components/layout/sidebar.tsx`:**
- Removed unused `NavItem` type import (lint fix).

**Verification:** 32 tests passing, lint clean, production build passing (26 routes).

### Objective Lock + Date-Based Monthly Targets (2026-05-14)

**Objective-is-read-only for KR assignees:**
- `objectives/[id]/page.tsx`: changed "Add Key Result" card gate from `{canManageDirectKrs ?` to `{canEditObjective && canManageDirectKrs ?` — KR owners who don't own the objective no longer see the create-KR form.
- `objectives/actions.ts` `createKeyResultAction`: added ownership check — only objective owner, CEO, or ADMIN can create KRs under an objective; others get an alert redirect.

**Date-based monthly targets (`src/lib/okr-calculations.ts`):**
- Added `MONTH_NAMES` constant (12 month names).
- Added `getQuarterMonthNames(quarter)` → `["April","May","June"]` for `"2026-Q2"`.
- Added `getMonthIndexForQuarter(quarter, date?)` → 1/2/3 if `date` is within that quarter/year, null otherwise (respects year — Q1 2026 ≠ Q1 2027).

**Updated displays:**
- `key-results/[id]/page.tsx` Monthly Targets card: labels are now "April Goal", "May Goal", "June Goal" based on KR's objective quarter.
- `objectives/[id]/page.tsx` KR table: monthly targets column shows "April: goal text" etc.
- `weekly-report/current/page.tsx`: header shows "May target period." Page description "May targets shown." Per-KR target found using `getMonthIndexForQuarter(kr.objective.quarter)` so only the matching quarter's target is shown, null-safe. Display shows "May: goal text".
- `my-okrs/page.tsx`: monthly targets column shows actual month names per KR's quarter.

**Test path:** Log in as `engineer@dten.com` → `/key-results/{id}` → Monthly Targets card shows "April Goal / May Goal / June Goal" (2026-Q2). Log in as `sales@dten.com` → `/weekly-report/current` → header shows "May target period." and KR Updates section shows "May: Build pipeline to consistently deliver 10 qualified demos" in KR subtitle.

**Verification:** lint clean, production build passing (25 routes, TypeScript clean).

### R3.4 Monthly Target Text Redesign (2026-05-14)

**Motivation:** User clarified that monthly targets should be text-based task descriptions set by the KR owner — not numeric value/percent inputs entered during KR creation.

**Schema changes (`prisma/schema.prisma`):**
- `MonthlyTarget` model: dropped `targetValue Float?` and `targetPercent Float?`; added `title String?`.
- Migration: `20260514200000_r3_4_monthly_target_text`.

**Updated `src/app/objectives/actions.ts`:**
- `createKeyResultAction`: removed `monthlyTargets.create` block (3 rows with targetValue/targetPercent); removed `currentMonthTargetPercent` from form data; pacing always initialises as `NO_TARGET`.
- `updateKeyResultAction`: removed `monthlyTarget.upsert` loop; removed `currentMonthTargetPercent` from form data; pacing always `NO_TARGET`. Removed unused `getCurrentQuarterMonthIndex` import.

**Updated `src/app/weekly-report/actions.ts`:**
- `savePriorityCheckInAction`: removed `monthlyTargets` from `linkedKeyResult` include; pacing set to `NO_TARGET`.
- `saveKrUpdateAction`: removed `monthlyTargets` from `keyResult` include; pacing set to `NO_TARGET`. Removed unused `getCurrentQuarterMonthIndex` import.
- `ensureCurrentWeeklyReport`: removed `monthlyTargets` from priorities' linkedKeyResult include.

**Updated `src/app/objectives/[id]/page.tsx`:**
- Removed Month 1/2/3 Target Value + Target Percent fields from the KR create form.
- KR table "Monthly Targets" column now shows `M{N}: {title ?? "–"}` instead of percent.

**Updated `src/app/key-results/[id]/page.tsx`:**
- Removed Month 1/2/3 numeric fields from the KR edit form.
- Updated "Update KR" card description.
- Added **Monthly Targets** card (full-width, below the Summary+Edit 2-grid): 3 text inputs for Month 1/2/3 goals, disabled for non-editors. Save button triggers `saveMonthlyTargetsAction`.

**New `saveMonthlyTargetsAction` in `src/app/key-results/actions.ts`:**
- Upserts 3 MonthlyTarget rows (title only) for the given KR.
- Editable by: KR owner, CEO, ADMIN, EXECUTIVE, MANAGER.

**Updated `src/app/weekly-report/current/page.tsx`:**
- KR Updates section: monthly target display changed from `M{N} target: {percent}%` to `M{N}: {title}` (shown only when title is set).

**Updated `src/app/my-okrs/page.tsx`:**
- Monthly Targets column: changed from `targetPercent ?? 0}%` to `title ?? "–"`.

**Updated `prisma/seed.ts`:**
- Replaced numeric monthly target rows with meaningful text descriptions for all 4 seeded KRs × 3 months.

**Test path:** Log in as `engineer@dten.com` → `/key-results/{shipD7x-id}` → see Monthly Targets card with seeded month goals pre-filled → edit Month 2 goal → Save Monthly Targets. Log in as `sales@dten.com` → `/weekly-report/current` → KR Updates section shows `M2: <goal text>` under the KR title.

**Verification:** lint clean, production build passing (25 routes, TypeScript clean). DB migrated + reseeded.

### PRD Update: R3.4.12 Objective Draft/Publish Workflow (2026-05-15)

**Doc-only change:** Updated `dten_okr_weekly_execution_system_prd.md` to add R3.4.12.

**New product direction:**
- Create Objective hides status and defaults new objectives to `DRAFT`.
- Objective/KR creation does not include monthly target setup.
- Editor has `Save for Later` and `Publish Objective`.
- `Save for Later` persists objective/KR information as draft and exits.
- `Publish Objective` validates required fields, KR assignment scope, and direct KR weights totaling 100.
- Publish failures should render red inline messages at the exact failed field or section.
- Successful publish changes objective status to `IN_PROGRESS`.
- Published objective edits show a status selector without `DRAFT` and use an `Update` action.

**PRD sections updated:** objective status behavior, Company OKR actions, Objective APIs, Create Objective flow, new R3.4.12 section, R3.4 build priority, R3.4 DOD, reusable components, error handling, validation rules, and R3.4 testing requirements.

**Verification:** documentation-only review and `git diff` sanity check. No app tests run.

### PRD Update: R3.4.13 KR Edit/Delete Impact Confirmation (2026-05-15)

**Doc-only change:** Updated `dten_okr_weekly_execution_system_prd.md` to add R3.4.13 as the next implementation session.

**New product direction:**
- Objective creator / owner can add, edit, delete, and reweight direct KRs under their objective.
- "KR contribution percentage" means direct KR `weight_percent`, not deprecated child-objective assignment contribution.
- Assigned KR delete, reassignment, and published-objective reweighting require impact confirmation.
- Confirmation must show impacted users by name/email before commit.
- Cancelling confirmation leaves data unchanged.
- Confirmed changes notify impacted users and write audit logs.
- Final KR weights must still pass publish/update validation; a published direct-KR objective cannot be left with zero KRs.

**PRD sections updated:** Key Result business rules, permissions, notification types, Key Result APIs, R3.4.12 update behavior, new R3.4.13 section, R3.4 build priority, R3.4 DOD, reusable components, error handling, validation rules, and R3.4 testing requirements.

**Verification:** documentation-only review. No app tests run.

### Weekly Task Form Fixes (2026-05-14)

**Bug:** After saving a This Week / Next Week task, the Status select reset to "Not Started". Root cause: React reconciliation — the card's `key={task.id}` never changed, so React kept the card as the same DOM element and did not re-apply `defaultValue` on uncontrolled inputs after the server action revalidated the page.

**Fix:** Changed `key={task.id}` to `key={`${task.id}-${task.status}-${task.progressPercent}`}` on both This Week and Next Week task cards. When the server saves new values and re-renders the page, the changed key forces React to unmount and remount the card, applying the correct `defaultValue`.

**Feature:** Replaced the Progress dropdown (0 / 25 / 50 / 75 / 100%) with a free-form `<input type="number" min="0" max="100">` in both task sections. The `updateWeeklyTaskAction` already uses `clamp(numberValue(...), 0, 100)` so no server change was needed.

**Verification:** lint clean, production build passing (26 routes, TypeScript clean).

**Test path:** `engineer@dten.com` → `/weekly-report/current` → add a This Week task → change Status to "In Progress", type 65 in Progress → Save → status and progress bar stay at the saved values on re-render.

### Real-Date Monthly Target Display (2026-05-14)

**Problem:** Monthly targets were showing all three quarter months (April/May/June) without any awareness of the current real date, making past months (e.g. April when today is May 14) show as equally prominent.

**Changes:**

- **`src/app/key-results/[id]/page.tsx`**: Added `getMonthIndexForQuarter` import. Monthly Targets card now annotates each month label: "— Current" (bold, accent border), "— Past" (muted label), or no annotation for upcoming. Visually communicates which month is active.
- **`src/app/objectives/[id]/page.tsx`**: Added `getMonthIndexForQuarter`. KR table Monthly Targets column now shows only the current month's target (e.g. "May: goal text") when inside the quarter; falls back to all months when viewing a past/future quarter.
- **`src/app/my-okrs/page.tsx`**: Same treatment — Assigned KRs table Monthly Targets column shows current month only (or all if outside the quarter).
- **`src/app/weekly-report/current/page.tsx`**: Monthly goal surfaced as the page header title (replacing "Weekly Report"). Picks the first KR with a set goal for the current calendar month as the canonical goal text; falls back to "Weekly Report" if none is set. Description reads "May goal · week range". Per-KR goal lines removed entirely — employees are expected to share the same monthly goal across their KRs.

**Verification:** lint clean, production build passing (26 routes, TypeScript clean).

**Test path:** Log in as `engineer@dten.com` → `/key-results/{id}` → Monthly Targets card: April label is muted/Past, May label is bold/Current, June label is plain Upcoming. → `/weekly-report/current` → KR Updates section: each KR card shows "May goal: <text>" as a prominent bold line above the progress bar.

### R3.4 Chunk E — Monthly Target Polish + Dashboard + Company Tree Scoping (2026-05-14)

**Updated `src/app/weekly-report/current/page.tsx`:**
- Page header description now reads: `"{week range} · Month {N} target period."` — satisfies PRD item 14 (weekly report title shows current monthly target context).

**Updated `src/app/dashboard/page.tsx`:**
- `currentReport` query: replaced `priorities: true` include with `weeklyTasks: { select: { id: true } }`.
- "Current Report" StatCard detail now shows task count (`"N task(s)"`) instead of priority count.
- Dashboard no longer reads from the deprecated WeeklyPriority model for the weekly report card.

**Updated `src/app/company-tree/page.tsx`:**
- Role-based scoping added (PRD DOD item 12 — "Company tree view is scoped by role/org tree"):
  - CEO/ADMIN/EXECUTIVE: all objectives and departments.
  - DEPARTMENT_HEAD: company-level objectives + own department (all levels within it).
  - MANAGER/EMPLOYEE/VIEWER: company-level + own department + own team + own objectives.
- `departmentWhere` filters the departments list to only show relevant cards.
- Scope label shown in page description.

**Verification:** 32 tests passing, lint clean, production build passing (26 routes, TypeScript clean).

**DB migration needed before testing:** `npx prisma migrate deploy` (or `prisma db push`) then `npm run prisma:seed`.

### R3.4 Chunks C+D — WeeklyTask Schema + Simplified Weekly Report (2026-05-14)

**Schema changes (`prisma/schema.prisma`):**
- New enums: `WeeklyTaskStatus` (NOT_STARTED, IN_PROGRESS, COMPLETED, BLOCKED, CANCELLED) and `WeeklyTaskSectionType` (THIS_WEEK, NEXT_WEEK).
- New model `WeeklyTask`: `weeklyReportId`, `sectionType`, `content`, `progressPercent` (default 0), `status` (default NOT_STARTED), `blocker?`. Cascade delete on report.
- `WeeklyReport` gains `weeklyTasks WeeklyTask[]` relation.
- Migration: `20260514100000_r3_4_weekly_tasks`.
- `prisma generate` run to update client.

**Updated `src/app/weekly-report/actions.ts`:**
- Added `WeeklyTaskSectionType`, `WeeklyTaskStatus` type imports.
- `weeklyTaskStatuses` and `weeklyTaskSectionTypes` validation arrays.
- `ensureCurrentWeeklyReport`: now includes `weeklyTasks` and `comments` (with author) in the returned report.
- `submitWeeklyReportAction`: removed priority-count check and KR-link check (no longer required in R3.4). Removed `priorityCount` from audit metadata.
- New `createWeeklyTaskAction`: creates a task in a section, validates max 3 per section.
- New `updateWeeklyTaskAction`: updates content, progress (0–100), status, blocker; validates report is DRAFT/NEEDS_FOLLOW_UP.
- New `deleteWeeklyTaskAction`: deletes task owned by current user's report.
- New `saveKrUpdateAction`: direct KR check-in from the weekly report (no priority required); upserts CheckIn with `weeklyPriorityId=null`, updates KR, triggers roll-up and KR_BLOCKED notification if applicable.

**Rewritten `src/app/weekly-report/current/page.tsx`:**
- Section 1: This Week's Tasks — up to 3 THIS_WEEK tasks with update/delete forms; add-task form shown when < 3.
- Section 2: Next Week's Tasks — same layout for NEXT_WEEK tasks.
- Section 3: KR Updates — all user-owned KRs shown with objective context, current month target %, progress bar, and `saveKrUpdateAction` form. "Updated this week" / "No update yet" badge.
- Section 4: Comments — uses existing `addWeeklyReportCommentAction`; shows all report comments chronologically.
- Section 5: Weekly Summary + Submit — unchanged behaviour.
- No dependency on WeeklyPriority for the new sections; old sections (Plan/Report) removed.

**Verification:** 32 tests passing, lint clean, production build passing (26 routes, TypeScript clean).

**Test path:** Log in as `engineer@dten.com` → `/weekly-report/current` → add 1 "This Week" task, set it to In Progress 75% → add 1 "Next Week" task → update a KR value/confidence → Save Update shows "Updated this week" badge → Submit sends to manager. Log in as `manager@dten.com` → `/reviews/pending` → comment on report → comment appears in employee's view.

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

### R3.4.11 + R3.4.12 — My Team Tree + Objective Draft/Publish Workflow (2026-05-15)

**Navigation changes (`src/lib/routes.ts`):**
- Removed "Create Objective" from sidebar OKR group (access only via Company OKRs page CTA).
- Company OKRs now visible to all roles including EMPLOYEE.
- "Company Tree" removed from OKR group; replaced by standalone "My Team" nav item (all roles).
- My Team gated by `hasDirectReports: boolean` passed through `AppShell` → `Sidebar`.

**R3.4.11 — My Team tree (`src/app/company-tree/page.tsx`, rewritten):**
- Simplified tree: current user as root node (blue card) + one layer of direct reports.
- `app-shell.tsx` made async; queries `prisma.user.count({ where: { managerId: user.id } })` and passes `hasDirectReports` to `Sidebar`.
- `Sidebar` skips rendering the `/company-tree` link when `hasDirectReports` is false.
- CSS added to `globals.css`: `.person-tree`, `.person-tree-root`, `.person-tree-root-card`, `.person-tree-connector`, `.person-tree-children`, `.person-tree-child-card`.

**My OKRs merge (`src/app/my-okrs/page.tsx`):**
- Removed separate "Objectives via Assigned KRs" card.
- Single "My Objectives" table with `tag: "owner" | "assigned_kr"` column.
- Owner-wins dedup: if user is both owner and KR assignee, shows as Owner (blue badge).
- Assigned KR objectives (grey badge) are read-only (no edit link shown).

**R3.4.12 — Objective draft/publish workflow:**

*`src/app/objectives/actions.ts` (major rewrite):*
- Removed 6 R3.2 assignment actions (dead code) and their imports.
- Exported types: `ObjectiveFormErrors`, `ObjectiveFormState` — compatible with `useActionState`.
- Non-exported module constants: `objectiveLevels`, `objectiveProgressSources`, `workStatuses` (removed `export` to comply with `"use server"` rule — only async functions may be exported from `"use server"` files).
- `createObjectiveAction(_prevState, formData)`: intent="save" → DRAFT (no weight validation); intent="publish" → validates required fields, KR owner scope, KR weights=100 for DIRECT_KRS, sets status=ON_TRACK. Returns `{ errors }` on failure, `redirect()` on success.
- `updateObjectiveAction(_prevState, formData)`: intent="save" → draft save; intent="update" → validates KR weights for DIRECT_KRS if published. Returns `{ errors }` or redirects.

*New `src/app/objectives/create-objective-form.tsx` (client component):*
- `useActionState` for inline server-returned errors.
- `useState<number[]>` for dynamic KR rows (add/remove); sequential re-indexing for form field names.
- Fields: `krTitle_N`, `krOwnerId_N`, `krStart_N`, `krTarget_N`, `krWeight_N`, `krConfidence_N`.
- Hidden `krCount` field so action knows how many rows to parse.
- Inline field errors via `.field-error` class.
- Two submit buttons: `intent=save` ("Save for Later"), `intent=publish` ("Publish Objective").

*New `src/app/objectives/edit-objective-form.tsx` (client component):*
- `useActionState` wrapping `updateObjectiveAction`.
- Status selector excludes DRAFT for already-published objectives.
- Draft: "Save for Later" + "Publish Objective" buttons. Published: single "Update Objective" button.

*`src/app/objectives/new/page.tsx` (rewritten):*
- Thin server wrapper; fetches `allUsers`, `assignableUsers`, `departments`, `teams` and passes to `CreateObjectiveForm`.

*`src/app/objectives/[id]/page.tsx` (updated):*
- Renders `<EditObjectiveForm>` instead of inline edit form.
- Removed unused `objectiveLevels` and `objectiveProgressSources` constants and `_unused` hack.

*`src/app/globals.css`:*
- Added `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-sm` — aliases for raw `<button>` elements.
- Added `.form-actions`, `.field-error`, `.kr-row-editor`, `.kr-row-header`.

**Test path:**
- `engineer@dten.com` → `/objectives/new` → fill title, leave KR weight blank → click "Publish Objective" → red inline error "KR weights must total 100%". Fill correctly → publish → redirects to objective detail showing status ON_TRACK.
- `engineer@dten.com` → any objective they own → edit form shows correct status options (no DRAFT if published) → click "Update Objective" → success.
- `manager@dten.com` → sidebar → "My Team" visible (has direct reports) → shows direct reports cards.
- `engineer@dten.com` → sidebar → "My Team" hidden (no direct reports).

**Verification:** lint clean (0 warnings), production build passing (25 routes, TypeScript clean).

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

Latest verified state (2026-05-14, testing branch):

```text
Migrations       : 10 applied, schema up to date
Vitest           : 5 files, 32 tests — all passing
Lint             : clean
Build            : production build passes (25 routes)
currentWeekReports: 0 (DB reseeded after R3.3)
Objectives       : 4 (3 DIRECT_KRS, 1 CHILD_OBJECTIVES)
ObjectiveAssignments: 2 (both PREDEFINED_CHILD_OBJECTIVE / ACTIVE)
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

Next target: **Day 27 — Objective Health Calculation (R3.4)**

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
