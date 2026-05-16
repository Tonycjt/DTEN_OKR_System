# DTEN OKR Weekly Execution System PRD

**Version:** Compressed R3.4 source of truth  
**Status:** Active product direction after leadership feedback  
**Last updated:** 2026-05-15

## 1. Purpose

This PRD is the compact source of truth for the DTEN OKR Weekly Execution System.

Release 1 and Release 2 are completed historical baselines. Release 3.1, 3.2, and 3.3 introduced useful infrastructure, but parts of those releases were superseded by the R3.4 simplification. R3.4 is the active product model.

When older behavior conflicts with R3.4, follow R3.4.

## 2. Product Vision

DTEN needs a lightweight internal execution system that helps leaders, managers, and employees understand whether company goals are being executed week by week.

The system should answer:

```text
1. What objectives exist?
2. Which KRs define success?
3. Who owns each KR?
4. What monthly target is the KR working toward?
5. What did each person work on this week?
6. Did the work move KR progress?
7. What is blocked, behind, or low confidence?
8. What should managers review or respond to?
```

The product is an OKR-driven execution system, not a generic task tracker.

## 3. Active Product Model

R3.4 simplifies the system to this chain:

```text
Parallel Objective
-> Direct Key Results
-> Monthly Targets
-> Weekly Report
-> Weekly Tasks
-> KR Updates
-> Manager Comments / Review
-> Dashboard and History
```

Active R3.4 rules:

```text
- No active child objective workflow.
- No separate weekly planning module.
- No objective proposal workflow.
- Objectives are parallel.
- Objective progress and health come from direct KRs.
- Weekly reports contain this week's tasks, next week's tasks, and KR updates.
- Monthly targets organize weekly KR progress.
```

Deprecated but allowed to remain for compatibility:

```text
- parent_objective_id
- progress_source = CHILD_OBJECTIVES
- objective_assignments
- child objective proposal statuses
- WeeklyPriority / weekly-plan structures
```

Do not build new active UI around deprecated workflows.

## 4. Completed Historical Baseline

### Release 1: MVP Completed

Release 1 established the original working system:

```text
- Local email/password authentication.
- Users, departments, and teams.
- Objective and KR creation.
- Monthly targets.
- Weekly reports.
- Weekly priorities and check-ins.
- Manager reviews.
- Basic dashboards.
- Notifications and audit logs.
- Seeded demo data.
```

R3.4 keeps the useful foundation but replaces weekly priority/planning as the active workflow.

### Release 2: Execution Visibility Completed

Release 2 added operational visibility:

```text
- Delegated review owner routing.
- Smarter risk detection.
- Department health comparison.
- KR trend history.
- Follow-ups.
- KR/report comments.
- Email notification foundation.
- Dashboard filters and CSV export.
- Search.
- Executive summary.
- Org import and org tree support.
```

R3.4 keeps these as supporting capabilities, especially delegated review routing, comments, follow-ups, dashboards, notifications, org import, and org scope.

### Release 3.1-3.3: Historical / Partially Superseded

Keep:

```text
- Direct KR weights for objective progress.
- Roll-up helpers where they support direct KR progress.
- Concurrency fixes and alert-not-crash behavior.
- Org-scope assignment helpers.
```

Superseded by R3.4:

```text
- Child objective roll-up as active product behavior.
- Objective contribution assignment workflow.
- Child objective proposal workflow.
- Separate Weekly Plan page.
- Carry-over planning automation.
```

## 5. Roles

### CEO / Executive

```text
- View company dashboard and company OKRs.
- View company KR/objective health.
- See risk items, blockers, missing reports, and department health.
- Comment on important objectives, KRs, and reports.
- Assign KRs across the company if allowed.
```

### Department Head

```text
- View department OKRs, KRs, reports, and health.
- Assign KRs within department/org scope.
- Review and comment on department execution.
```

### Manager / Team Lead

```text
- View direct reports and allowed org subtree.
- Assign KRs within scope.
- Review weekly reports.
- Comment and request follow-up.
- Track team KR progress and blockers.
```

### Employee

```text
- View owned objectives.
- View objectives linked to assigned KRs.
- Update assigned KRs.
- Create/update monthly targets when allowed.
- Submit weekly reports.
- View personal weekly report history.
- Communicate with manager through comments.
```

### Admin

```text
- Manage users, departments, teams, roles, and imports.
- View audit logs.
- Configure system settings.
```

## 6. Navigation

Primary navigation:

```text
1. Dashboard
2. OKR
3. Weekly Report
```

OKR includes:

```text
- Company OKRs
- My OKRs
- My Team / scoped org tree when applicable
- Create Objective entry point inside OKR surfaces
```

Admin-only pages can exist, but should not appear for normal users.

## 7. Core Data Concepts

### User and Org

Important user fields:

```text
id, name, email, role, title, isActive,
departmentId, teamId, managerId, reviewOwnerId
```

Review routing:

```text
effectiveReviewer = user.reviewOwnerId ?? user.managerId
```

Org scope rules:

```text
- CEO / Admin / Executive: full company.
- Department Head: own department.
- Manager / Team Lead: self plus reporting subtree.
- Employee / Viewer: self unless specifically granted broader scope.
```

### Objectives

Objectives are parallel in R3.4.

Important fields:

```text
id, title, description, ownerId, level, quarter,
status, progressPercent, confidenceScore,
departmentId, teamId, createdAt, updatedAt
```

Stored status should follow the existing implementation where possible:

```text
DRAFT
ON_TRACK       user-facing label: In Progress
AT_RISK
OFF_TRACK
COMPLETED
ON_HOLD        user-facing label: Blocked / On Hold
```

If the UI uses the phrase "Publish Objective -> In Progress", store the published default as `ON_TRACK` unless the enum is deliberately migrated later.

### Objective Level Assignment

R3.4.15 behavior: users should not choose objective level during creation.

```text
- CEO-created objectives: COMPANY.
- Department Head-created objectives: DEPARTMENT.
- Team Leader-created objectives: TEAM.
- All other users: INDIVIDUAL.
```

Department/team context is inferred from the creator's org profile/company tree. The create form should not expose editable level, department, or team selectors. Backend must enforce this even if the frontend is bypassed.

### Key Results

KRs are the measurable execution unit under objectives.

Important fields:

```text
id, objectiveId, ownerId, title, metricName,
startValue, currentValue, targetValue,
progressPercent, weightPercent,
confidenceScore, status, pacingStatus
```

Rules:

```text
- Every KR belongs to exactly one objective.
- Every KR has one owner.
- KR assignment is limited by org scope.
- Assigned KR owners see the linked objective in My OKRs.
- Assigned-KR objective context is read-only unless the user also owns the objective or has elevated permission.
- Objective owner/creator can add, edit, delete, and reweight direct KRs under the objective.
```

In R3.4, "KR contribution percentage" means direct KR `weightPercent`, not child-objective assignment contribution.

### Monthly Targets

Each KR can have three monthly targets for the quarter.

R3.4 monthly targets are text goals/checkpoints, not numeric values created during objective/KR creation.

Rules:

```text
- Monthly targets belong to KRs.
- Monthly targets are edited from KR/monthly target surfaces, not during objective creation.
- Weekly reports and KR updates should show the relevant current monthly target.
- Missing current monthly target means pacingStatus = NO_TARGET.
```

### Weekly Reports

Weekly Report is the weekly execution container for each user.

Active sections:

```text
1. This week's tasks
2. Next week's tasks
3. KR updates
4. Comments
5. Summary / submit
```

Rules:

```text
- This week's tasks: max 3.
- Next week's tasks: max 3.
- Tasks do not have to link to KRs.
- Task progress does not automatically update KR progress.
- KR progress changes only through KR updates/check-ins.
- Submitted reports route to effectiveReviewer.
- Invalid operations redirect with ?error= and show an alert, not a crash.
```

### Weekly Report History

Weekly report history is personal by default.

Rules:

```text
- Each user sees their own history.
- Normal users cannot browse another person's history.
- No normal-user company-wide weekly history feed.
- Managers/review owners can access only reports in authorized review scope.
- Backend must enforce scope.
```

History structure:

```text
monthly target
-> KR
-> weekly report week
-> tasks and KR updates
```

History must show all tasks regardless of completion status, including progress percent, blocker, week range, summary, comments, review status, reviewer, and reviewer feedback when available.

### Comments, Reviews, Notifications, Audit Logs

Keep Release 1/2 behavior:

```text
- Comments on KRs and weekly reports.
- Manager review decisions: approved, needs follow-up, risk flagged.
- Notifications for report submission, review requested, follow-up, KR blocked/risk, comments, and KR impact changes.
- Audit logs for important objective, KR, weekly report, review, org, permission, and import changes.
```

## 8. Objective Create / Edit Workflow

### Create Objective

Create Objective should be a guided editor.

Hidden/system-owned during create:

```text
- status
- level
- department
- team
```

Default behavior:

```text
- New objective status = DRAFT.
- New objective level/org context is inferred from creator.
- Monthly targets are not configured during objective/KR creation.
```

Actions:

```text
Save for Later:
- Save objective and entered KRs as DRAFT.
- Does not require KR weights to total 100.
- Exits the editor.

Publish Objective:
- Validates required objective fields.
- Validates required KR fields.
- Validates KR owner assignment scope.
- Validates direct KR weights total 100.
- Does not require monthly targets.
- Shows red inline errors at exact failed fields/sections.
- On success, changes stored status from DRAFT to ON_TRACK (user-facing In Progress).
```

### Edit Published Objective

Published objective edit uses the same editor structure, with these differences:

```text
- Show a status selector.
- Do not include DRAFT in the selector.
- Use Update instead of Publish Objective.
- Objective owner/creator can add, edit, delete, reassign, and reweight direct KRs.
- Update validates final KR weights for direct-KR objectives.
```

### KR Impact Confirmation

Assigned KR delete, reassignment, or published-objective reweighting requires impact confirmation.

Impact confirmation must show:

```text
- impacted user name
- role/title when available
- email
- action being confirmed
```

Impacted users:

```text
- current KR owner
- new KR owner on reassignment
- users with weekly KR updates/check-ins tied to the KR
- users with open follow-ups or comments tied to the KR
```

If cancelled, no data changes. If confirmed, commit the change, notify impacted users, and write audit logs.

## 9. Pages

### Dashboard

R3.4.16 simplifies the dashboard into a role-aware "what needs attention this week" surface.

Keep the dashboard focused on action and execution health. Avoid mixing every available analytics, audit, export, search, and historical surface into the first view.

Employee dashboard:

```text
- Current Weekly Report.
- Assigned KRs.
- Follow-ups Assigned to Me.
- My Risk Items.
```

Manager dashboard:

```text
- Pending Reviews.
- Missing Updates.
- Team Risk Items.
- Team KR Health.
- Follow-ups Assigned to Me.
```

Executive / CEO / Admin dashboard:

```text
- Company Health.
- Department Health.
- Company Risk Items.
- Missing Updates.
- Pending / Escalated Reviews.
```

Move or de-emphasize:

```text
- Recent Audit Activity -> Admin/audit page only.
- Created Follow-ups -> Follow-up page or secondary view.
- Escalations as standalone card -> merge into Risk Items or Pending/Escalated Reviews.
- Objective Health as standalone card -> merge into Risk Items or Company/Team Health.
- Large filter set -> reduce to the most useful filters, such as Owner, Status, and Quarter.
- Export CSV / Executive Summary -> leader-only secondary actions, not primary dashboard content.
```

### Company OKRs

Shows company-visible objectives and direct KRs. Create/edit actions appear only where permitted.

### My OKRs

Shows:

```text
- objectives owned by the user
- objectives linked to KRs assigned to the user
```

Use tags:

```text
OWNER
ASSIGNED_KR
```

### Objective Detail / Editor

Shows objective summary, computed health, direct KRs, KR weights, and edit controls where allowed.

### KR Detail

Shows KR progress, confidence, status, monthly targets, comments, and update history.

### Weekly Report

Shows current weekly report sections:

```text
- This week's tasks
- Next week's tasks
- KR updates
- Comments
- Summary / submit
```

### Weekly Report History

Shows scoped personal report history grouped by monthly target -> KR -> week -> tasks/KR updates.

### My Team / Org Tree

Shows current user plus direct reports. Do not expose a full company tree to everyone.

### Admin

Admin pages can manage users, departments, teams, org import, audit logs, and settings.

## 10. APIs / Server Actions

Exact implementation may use Next.js server actions instead of REST, but behavior must match these contracts.

Important surfaces:

```text
auth: login, logout, current user
users/org: users, departments, teams, visible org scope, assignable users
objectives: create, update, publish, list, detail, health
key-results: create, update, delete, impact preview, assign, comments
monthly-targets: list/update by KR
weekly-reports: current, submit, detail, scoped history
weekly-tasks: create, update, delete
kr-updates/check-ins: create/update/list
reviews: pending, submit, history
comments: create/list
notifications: list/read
dashboard/export/search/summary: scoped by role
```

Server-side enforcement is required for auth, permissions, org scope, report history scope, KR assignment scope, objective create inference, and impact confirmation.

## 11. Calculations

### KR Progress

Use the existing progress helper:

```text
progressPercent = progress from startValue/currentValue/targetValue
```

Clamp progress to 0-100.

### Objective Progress

For R3.4 active objectives:

```text
- Use direct KRs only.
- If KR weights total 100, use weighted average.
- If no valid weights exist on a draft, average can be shown as preview.
- Published direct-KR objectives must have KR weights totaling 100.
```

### Objective Health

Calculate from direct KR statuses:

```text
- all KRs completed -> COMPLETED
- any KR ON_HOLD -> AT_RISK or blocked user-facing label
- majority KRs OFF_TRACK -> OFF_TRACK
- any KR AT_RISK or low confidence -> AT_RISK
- no recent update where expected -> NO_UPDATE / warning
- otherwise ON_TRACK
```

Use user-facing language carefully:

```text
ON_HOLD = Blocked / On Hold
OFF_TRACK = Behind / Off Track
ON_TRACK = In Progress / On Track
```

### Pacing

```text
no current monthly target -> NO_TARGET
no current-week KR update -> NO_UPDATE
progress >= current monthly target expectation -> ON_PACE
otherwise -> BEHIND
```

If monthly targets remain text-only, pacing can stay `NO_TARGET` until numeric pacing rules are reintroduced.

## 12. Permissions and Security

Backend must enforce all permissions.

Critical rules:

```text
- Users must not assign KRs outside org scope.
- Users must not edit objectives unless owner/creator or elevated role.
- Assigned-KR objective context is read-only unless user owns the objective or has elevated role.
- Users must not view reports or weekly history outside permission scope.
- Normal users must not access a company-wide weekly history feed.
- Invalid operations show user-facing alerts, not unhandled crashes.
- State transitions that must happen once use atomic updateMany with expected status.
```

Concurrency rule:

```text
Use updateMany({ where: { id, status: expected }, data: nextState })
and gate notifications/audit logs on count > 0.
Do not use findUnique-then-update for one-time transitions.
```

## 13. Validation

Validation rules:

```text
- title is required for objectives and KRs.
- KR owner is required.
- KR owner must be in assignable org scope.
- confidenceScore must be 1-5.
- progressPercent must be 0-100.
- task progress must be 0-100.
- this-week tasks max 3.
- next-week tasks max 3.
- new objective status is DRAFT and not user-selected.
- new objective level/department/team are inferred and not user-selected.
- published objective status cannot return to DRAFT through edit UI.
- publishing a direct-KR objective requires KR weights total 100.
- updating a published direct-KR objective requires final KR weights total 100.
- monthly targets are not required to save/publish an objective.
- KR impact confirmation is required for assigned KR delete/reassignment/reweight.
- weekly report history defaults to current user's own reports.
```

Error presentation:

```text
- Use red inline messages at exact failed field/section for editor validation.
- Use alert divs for invalid server-action redirects.
- Never crash the page for expected validation/permission failures.
```

## 14. R3.4 Implementation Sessions

Completed / implemented R3.4 chunks:

```text
R3.4.1  Simplified navigation and child objective cleanup.
R3.4.2  My OKRs includes owned objectives and assigned-KR objectives.
R3.4.3  KR assignment org scope.
R3.4.4  Scoped My Team / direct-report tree.
R3.4.5  Monthly target text goals.
R3.4.6  Simplified weekly report with tasks and KR updates.
R3.4.7  Weekly report comments.
R3.4.8  Objective health from direct KRs.
R3.4.12 Objective draft/publish/update workflow.
R3.4.13 KR edit/delete impact confirmation.
R3.4.14 Weekly report history.
R3.4.15 Objective creation level simplification.
```

Planned / not yet implemented:

```text
R3.4.16 Simplified role-based dashboard.
```

### R3.4.15 Objective Creation Level Simplification

**Status:** Implemented.

#### Goal

Objective creation should be simpler and should follow the company tree automatically. Users should not manually choose objective level, department, or team while creating an objective.

The system should infer the objective's level and org context from the creator's position in the company tree.

#### Create Objective Interface

Required:

```text
- Remove the Level selector from the Create Objective interface.
- Remove the Department selector from the Create Objective interface.
- Remove the Team selector from the Create Objective interface.
- Show inferred level and org context as read-only helper text if useful.
- User should focus on objective title, description, owner, quarter/year, direct KRs, and publish/save actions.
- Create Objective should still hide status and default to DRAFT.
```

Do not remove level/department/team display from read-only summary surfaces. This requirement only removes manual selection during objective creation.

#### Assignment Logic

Required:

```text
- If the creator is the CEO, created objectives are COMPANY level.
- If the creator is a Department Head, created objectives are DEPARTMENT level.
- If the creator is a Team Leader, created objectives are TEAM level.
- If the creator is any other user, created objectives are INDIVIDUAL level.
- Team Leader means the user owns/leads a team node in the company tree.
- Department and team IDs should be inferred from the creator's org profile/company tree where applicable.
- The inferred level/org context should be based on the creator, not on a manually selected owner field.
```

Department/team inference:

```text
- COMPANY objective: departmentId and teamId should usually be empty.
- DEPARTMENT objective: departmentId should be the creator's department; teamId should usually be empty.
- TEAM objective: departmentId and teamId should come from the creator's team context.
- INDIVIDUAL objective: departmentId/teamId may be copied from the creator for filtering/context, but level remains INDIVIDUAL.
```

#### Backend Validation

Required:

```text
- Backend must assign level, department, and team using the same company-tree logic as the UI.
- Backend must ignore or reject manually submitted create-objective level, department, or team values that conflict with inferred context.
- If the system cannot infer required department/team context for a Department Head or Team Leader, show a clear inline error and do not publish.
- Save for Later may save a draft only when enough creator org context exists to classify the objective level.
- Audit logs should record the inferred level and org context on objective creation.
```

#### Acceptance Criteria

```text
- Create Objective has no editable level field.
- Create Objective has no editable department field.
- Create Objective has no editable team field.
- CEO-created objectives are saved as COMPANY level.
- Department Head-created objectives are saved as DEPARTMENT level and use the creator's department context.
- Team Leader-created objectives are saved as TEAM level and use the creator's team context.
- Objectives created by all other users are saved as INDIVIDUAL level.
- Backend enforces inferred level/org context even if the frontend is bypassed.
- Conflicting manual level/department/team submissions are rejected or ignored safely.
- Missing required org context shows a red inline error at the objective creation form.
```

### R3.4.16 Simplified Role-Based Dashboard

**Status:** Planned. Not implemented yet.

#### Goal

The dashboard should be simplified into a role-aware weekly attention view. It should help each user quickly answer: "What do I need to do or watch this week?"

Do not use the dashboard as a catch-all for every report, audit log, export, filter, and historical surface.

#### Keep By Role

Employee dashboard:

```text
- Current Weekly Report: status, task count, and open-report action.
- Assigned KRs: progress, confidence, status, pacing, and objective context.
- Follow-ups Assigned to Me: open action items requiring response.
- My Risk Items: assigned KRs that are blocked, off track, behind pace, low confidence, or missing updates.
```

Manager dashboard:

```text
- Pending Reviews: submitted reports awaiting the manager/review owner's action.
- Missing Updates: direct reports / scoped users missing current-week report or update.
- Team Risk Items: scoped KRs and reports that are blocked, off track, behind, low confidence, or escalated.
- Team KR Health: compact summary of KR status, pacing, confidence, and missing updates.
- Follow-ups Assigned to Me.
```

Executive / CEO / Admin dashboard:

```text
- Company Health: compact company-level KR/objective/report health.
- Department Health: department comparison table.
- Company Risk Items: highest-priority blocked/off-track/low-confidence KRs and report risks.
- Missing Updates: company or visible-scope missing report/update count and list.
- Pending / Escalated Reviews: submitted reports awaiting action and manager-flagged risks.
```

#### Remove Or Move Elsewhere

Required:

```text
- Move Recent Audit Activity out of the main dashboard and keep it on the Admin/Audit page.
- Move Created Follow-ups to a follow-up page or secondary view.
- Merge standalone Escalations into Risk Items or Pending/Escalated Reviews.
- Merge standalone Objective Health into Risk Items or Company/Team Health.
- Reduce dashboard filters to the smallest useful set. Default recommended filters: Owner, Status, Quarter.
- Keep CSV export and Executive Summary as leader-only secondary actions, not primary dashboard content.
```

#### Acceptance Criteria

```text
- Employee dashboard shows only Current Weekly Report, Assigned KRs, Follow-ups Assigned to Me, and My Risk Items.
- Manager dashboard shows Pending Reviews, Missing Updates, Team Risk Items, Team KR Health, and Follow-ups Assigned to Me.
- Executive/CEO/Admin dashboard shows Company Health, Department Health, Company Risk Items, Missing Updates, and Pending/Escalated Reviews.
- Recent Audit Activity no longer appears on the main dashboard.
- Created Follow-ups no longer appears as a primary dashboard card.
- Escalations are merged into the simplified risk/review sections.
- Objective Health is merged into the simplified risk/health sections.
- Dashboard filters are reduced and do not dominate the page.
- Role-based data scope remains enforced by backend queries.
```

Current build priority:

```text
1. Keep sidebar simplified: Dashboard / OKR / Weekly Report.
2. Keep deprecated child-objective and weekly-plan UI hidden from active workflow.
3. Finish objective create/edit workflow:
   - no status selector on create
   - no level/department/team selectors on create
   - inferred level/org context
   - Save for Later
   - Publish Objective
   - inline validation
4. Finish simplified role-based dashboard (R3.4.16).
5. Finish objective-owner KR edit/delete/reweight flow with impact confirmation.
6. Finish scoped weekly report history.
7. Keep monthly target, weekly report, dashboard, and health behavior aligned with direct KRs.
8. Add tests for permission boundaries and validation failures.
```

## 15. R3.4 Definition of Done

R3.4 is complete when:

```text
1. Normal sidebar shows Dashboard, OKR, Weekly Report.
2. Create Objective lives inside OKR surfaces.
3. Create Objective has no status, level, department, or team selector.
4. Objective level/org context is inferred from creator.
5. New objectives default to DRAFT.
6. Save for Later saves draft objective/KR information and exits editor.
7. Publish Objective validates required fields, KR assignment scope, and KR weights.
8. Publish validation errors appear inline at failed fields/sections.
9. Successful publish stores objective as ON_TRACK / user-facing In Progress.
10. Published objective edit has status selector without DRAFT and uses Update.
11. Objectives are parallel and show direct KRs.
12. My OKRs shows OWNER and ASSIGNED_KR contexts.
13. Assigned-KR objectives are read-only unless user has edit permission.
14. KR assignment picker and backend are org-scoped.
15. Objective owner/creator can add, edit, delete, reassign, and reweight direct KRs.
16. Assigned KR delete/reassignment/reweight requires impact confirmation.
17. Impacted users are shown before commit and notified after confirmed change.
18. Each KR supports three monthly text targets.
19. Weekly Report has this week's tasks, next week's tasks, KR updates, comments, summary, and submit.
20. Task limits are enforced at 3 per section.
21. KR update section updates measurable KR progress.
22. Weekly Report History is scoped to current user by default.
23. History shows monthly target -> KR -> week -> tasks and KR updates.
24. History shows all tasks and progress percent regardless of completion status.
25. Objective health is calculated from direct KRs.
26. Dashboard is simplified by role:
    - employees see current report, assigned KRs, assigned follow-ups, and personal risks
    - managers see pending reviews, missing updates, team risks, team KR health, and assigned follow-ups
    - executives see company health, department health, company risks, missing updates, and pending/escalated reviews
27. Audit activity, created follow-ups, standalone objective health, and standalone escalations are removed from the primary dashboard.
28. Dashboard filters are reduced and do not dominate the page.
29. Backend enforces all permission and org-scope rules.
```

## 16. Test Requirements

High-priority tests:

```text
- Employee sees simplified nav.
- Create Objective hides status, level, department, and team selectors.
- CEO-created objective is COMPANY.
- Department Head-created objective is DEPARTMENT.
- Team Leader-created objective is TEAM.
- Employee-created objective is INDIVIDUAL.
- Backend rejects conflicting create-objective level/org submissions.
- Save for Later saves DRAFT.
- Publish blocks missing required fields.
- Publish blocks invalid KR weights.
- Publish succeeds without monthly targets.
- Objective owner can edit/reweight KRs.
- Assigned KR delete/reassignment/reweight shows impact confirmation.
- Cancelled impact confirmation changes nothing.
- Confirmed impact change notifies impacted users.
- Employee cannot edit assigned-KR objective context.
- Manager cannot assign KR outside org scope.
- Weekly Report enforces 3 this-week and 3 next-week tasks.
- KR update changes KR current value/progress/status/confidence.
- Employee sees only own weekly report history.
- Manager/review owner sees only authorized report history.
- Normal user cannot access company-wide history.
- Objective health responds to completed, blocked, behind, and at-risk KRs.
- Employee dashboard shows only the simplified employee sections.
- Manager dashboard shows only the simplified manager sections.
- Executive dashboard shows only the simplified executive sections.
- Audit activity is not shown on the main dashboard.
- Created follow-ups are not shown as a primary dashboard section.
- Dashboard filters are reduced to the approved simplified set.
```

## 17. Open Questions

Default assumptions until changed:

```text
- Assigned KR owner can edit monthly targets.
- Weekly report can group multiple monthly targets if needed.
- Tasks use both status and progress percent.
- Manager comments are optional unless requesting follow-up.
- Org visibility is based on reporting subtree.
- KRs have one owner.
- Team Leader is determined from the company tree/team lead relationship.
```

Questions:

```text
1. Should assigned KR owners always edit monthly targets, or require manager approval?
2. Should weekly report title show one monthly target or multiple grouped targets?
3. Should CEO/Admin ever have a full browsable weekly history feed, or only audit/search?
4. Should objective owner be allowed to assign KRs to anyone under the objective owner, or only reporting scope?
5. Should KR multi-owner support be planned later?
```

## 18. Demo Environment

Demo users:

```text
ceo@dten.com
head@dten.com
manager@dten.com
engineer@dten.com
sales@dten.com
password: Password123!
```

Local commands:

```powershell
.\start-db.cmd
.\start-dev.cmd
npm run prisma:seed
npm run test -- --run
npm run lint
npm run build
```

Do not reset/reseed the demo DB unless Tony explicitly asks or the work session requires it.
