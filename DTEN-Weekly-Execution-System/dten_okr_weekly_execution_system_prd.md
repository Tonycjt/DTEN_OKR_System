# DTEN OKR Weekly Execution System — Updated PRD / PDR

**Version:** R3.4 Simplification Update  
**Status:** Updated after leadership feedback  
**Important rule:** Release 1, Release 2, Release 3.1, Release 3.2, and Release 3.3 are treated as completed historical releases. This document does **not** ask engineering to rewrite those releases from scratch. R3.4 defines the product simplification layer and should supersede any earlier workflow that conflicts with the simplified model.

---

## 0. Document Purpose

This document defines the updated product, technical, and release requirements for the DTEN OKR Weekly Execution System.

The goal is to keep the system implementation-ready while simplifying the workflow based on leadership feedback.

The main simplification is:

```text
No child objectives.
No weekly planning module.
No complicated objective proposal workflow.
Objectives are parallel.
Objectives contain defined KRs.
Weekly reports connect employee tasks and KR updates to monthly targets.
```

The product should remain an OKR-driven execution system, not a generic task tracker.

---

## 1. Product Vision

DTEN needs a lightweight internal execution system that helps leadership understand whether company goals are being executed week by week.

The system should help answer:

```text
1. What objectives exist?
2. Which KRs define success for each objective?
3. Who owns each KR?
4. What monthly target is the KR currently working toward?
5. What did each person work on this week?
6. Did the work move the KR forward?
7. What is blocked, behind, or low confidence?
8. What should the manager know or respond to?
```

The system should avoid unnecessary hierarchy and approval complexity.

---

## 2. Core Product Principle

Every meaningful weekly update should connect to a measurable Key Result.

The updated execution chain is:

```text
Objective
→ Key Result
→ Monthly Target
→ Weekly Report
→ KR Update
→ Manager Comment / Review
→ Dashboard
```

### Important R3.4 Simplification

The previous child-objective model is removed from the active product direction.

The system should not require:

```text
Parent objective
→ child objective
→ proposed child objective
→ child objective approval
→ child objective rollup
```

Instead:

```text
All objectives are parallel.
Each objective has its own defined KRs.
KRs can be assigned to users.
Users report weekly progress against the KRs assigned to them.
Objective health is calculated from its direct KRs.
```

---

## 3. Target Users

### 3.1 CEO / Executive

Needs to:

- View company-level dashboard.
- View company OKRs.
- See objective and KR health.
- Identify high-risk KRs.
- See missing weekly reports.
- Review blockers requiring leadership attention.
- Comment on high-risk or important items.

### 3.2 Department Head

Needs to:

- View department-related OKRs.
- View reports and KR progress from people under them.
- Identify KRs that are behind, blocked, or low confidence.
- Review manager-level execution health.

### 3.3 Manager / Team Lead

Needs to:

- View direct reports and people under them in the org tree.
- Assign KRs only to people under them.
- Review weekly reports.
- Comment on report progress.
- Request follow-up for at-risk work.
- See team KR progress and blockers.

### 3.4 Individual Contributor / Employee

Needs to:

- View objectives they own.
- View objectives connected to KRs assigned to them.
- Distinguish between editable owned objectives and read-only assigned-KR-related objectives.
- Create monthly targets for assigned KRs when required.
- Submit weekly reports.
- Update progress on this week's tasks.
- Update assigned KRs.
- Communicate with their manager through comments.

### 3.5 Admin

Needs to:

- Manage users.
- Import organization structure from CSV / Excel.
- Manage departments and teams.
- Manage roles and permissions.
- Configure quarters and system settings.

---

## 4. Simplified Navigation

The application should use a simplified menu.

```text
1. Dashboard
2. OKR
3. Weekly Report
```

### 4.1 Dashboard

Dashboard should be role-aware.

For employees:

```text
- My current weekly report status
- My assigned KRs
- My monthly targets
- My blockers
- Manager comments
```

For managers:

```text
- Direct report weekly report status
- KRs owned by people under them
- Behind / blocked KRs
- Pending comments or reviews
```

For CEO / executives:

```text
- Company objective health
- Company KR health
- Behind / blocked / low-confidence KRs
- Missing weekly reports
- Department / team health summary
```

### 4.2 OKR

Under OKR, show:

```text
- Company OKR
- My OKR
```

Create Objective should be a function inside the OKR page, not a separate top-level menu item.

### 4.3 Weekly Report

Weekly Report is the only weekly execution page.

There should no longer be a separate Weekly Plan module.

---

## 5. System Modules

The updated product should be divided into the following modules:

```text
1. Authentication & Authorization
2. Organization Management
3. OKR Management
4. KR Assignment
5. Monthly Targets
6. Weekly Reports
7. KR Updates
8. Manager Comments / Reviews
9. Dashboard & Reporting
10. Notifications
11. Audit Logs
```

Removed from active R3.4 scope:

```text
- Child objective proposal workflow
- Weekly plan workflow
- Objective assignment contribution workflow
- Parent-child objective rollup workflow
```

---

## 6. Recommended Technical Stack

The final stack can be adjusted by the engineering team.

Recommended stack:

```text
Frontend: React or Next.js
Backend: Node.js/NestJS or Python/FastAPI
Database: PostgreSQL
Authentication: Company SSO later; local login acceptable for MVP
ORM: Prisma, TypeORM, SQLAlchemy, or equivalent
Deployment: Internal cloud/server environment
```

For fast MVP iteration, Next.js + PostgreSQL + Prisma is acceptable.

---

## 7. Core Data Model

## 7.1 Users

```text
users
- id
- name
- email
- password_hash or auth_provider_id
- title
- role
- department_id
- team_id
- primary_manager_id
- local_manager_id
- review_owner_id
- status
- created_at
- updated_at
```

Allowed roles:

```text
ADMIN
CEO
EXECUTIVE
DEPARTMENT_HEAD
MANAGER
EMPLOYEE
VIEWER
```

Business rules:

```text
- review_owner_id defaults to primary_manager_id if empty.
- inactive users should not receive new KR assignments.
- manager visibility should be based on the org tree.
```

---

## 7.2 Departments

```text
departments
- id
- name
- lead_user_id
- created_at
- updated_at
```

---

## 7.3 Teams

```text
teams
- id
- department_id
- name
- team_lead_id
- created_at
- updated_at
```

---

## 7.4 Objectives

Objectives are parallel in R3.4.

```text
objectives
- id
- title
- description
- owner_id
- owner_type
- level
- quarter
- year
- status
- health_status
- progress_percent
- confidence_score
- created_by
- created_at
- updated_at
```

Allowed objective levels:

```text
COMPANY
DEPARTMENT
TEAM
INDIVIDUAL
```

Allowed objective statuses:

```text
DRAFT
ACTIVE
COMPLETED
CANCELLED
```

Allowed objective health statuses:

```text
NOT_STARTED
ON_TRACK
AT_RISK
BEHIND
BLOCKED
COMPLETED
NO_UPDATE
```

### Removed / Deprecated Fields

The following fields should not be used for new R3.4 functionality:

```text
parent_objective_id
progress_source = CHILD_OBJECTIVES
objective_assignments
child objective proposal status
assignment contribution percent
```

If these fields already exist in the database from previous releases, they can remain for backward compatibility, but the UI should not expose child objective creation or proposal workflow.

---

## 7.5 Key Results

A Key Result is the measurable execution unit under an objective.

```text
key_results
- id
- objective_id
- title
- description
- owner_id
- metric_type
- start_value
- target_value
- current_value
- unit
- progress_percent
- weight_percent
- status
- confidence_score
- pacing_status
- due_date
- created_by
- created_at
- updated_at
```

Allowed metric types:

```text
NUMBER
PERCENTAGE
BOOLEAN
MILESTONE
CURRENCY
CUSTOM
```

Allowed KR statuses:

```text
NOT_STARTED
ON_TRACK
AT_RISK
BEHIND
BLOCKED
COMPLETED
CANCELLED
```

Allowed pacing statuses:

```text
AHEAD
ON_PACE
BEHIND
NO_TARGET
NO_UPDATE
```

Business rules:

```text
- Every KR must belong to exactly one objective.
- Every KR must have one owner.
- KRs can be assigned to users under the assigner's org tree scope.
- A user assigned to a KR should see the linked objective in My OKR.
- KR-related objectives shown through assigned KRs are read-only unless the user also owns the objective.
```

---

## 7.6 Monthly Targets

Each KR has three monthly targets for the quarter.

Monthly targets are now a core product concept and should be visible in the Weekly Report workflow.

```text
monthly_targets
- id
- key_result_id
- owner_id
- month_index
- target_value
- target_percent
- checkpoint_note
- status
- created_by
- created_at
- updated_at
```

Allowed month indexes:

```text
1
2
3
```

Allowed monthly target statuses:

```text
DRAFT
ACTIVE
ACHIEVED
MISSED
CANCELLED
```

Business rules:

```text
- Each KR should have three monthly targets.
- When a KR is assigned to a user, the KR owner or assigned user should define monthly targets.
- Monthly targets belong to a KR, not to a weekly report.
- Weekly reports are organized around the current monthly target.
- If no monthly target exists for the current month, pacing_status = NO_TARGET.
```

### Monthly Target Concept

For a quarterly OKR:

```text
Month 1 target = expected progress by the end of month 1.
Month 2 target = expected progress by the end of month 2.
Month 3 target = expected progress by the end of month 3.
```

Monthly targets act as checkpoints, not separate objectives.

---

## 7.7 Weekly Reports

Weekly Report is the weekly execution container for each user.

```text
weekly_reports
- id
- user_id
- week_start_date
- week_end_date
- monthly_target_id
- title
- status
- submitted_at
- reviewed_at
- reviewer_id
- manager_comment
- created_at
- updated_at
```

Allowed report statuses:

```text
DRAFT
SUBMITTED
REVIEWED
NEEDS_FOLLOW_UP
OVERDUE
```

### Weekly Report Title Rule

The weekly report title should be the current monthly target.

Example:

```text
Monthly Target: Complete 60% of Teams certification test cases
```

If the user has multiple active monthly targets, the Weekly Report page can group by monthly target or show a selector.

---

## 7.8 Weekly Tasks

Weekly tasks replace the older weekly priorities / weekly plan concept.

There are two task sections inside the Weekly Report:

```text
1. This week's tasks
2. Next week's tasks
```

```text
weekly_tasks
- id
- weekly_report_id
- section_type
- content
- progress_percent
- status
- blocker
- created_at
- updated_at
```

Allowed section types:

```text
THIS_WEEK
NEXT_WEEK
```

Allowed task statuses:

```text
NOT_STARTED
IN_PROGRESS
COMPLETED
BLOCKED
CANCELLED
```

Business rules:

```text
- This week's tasks are limited to 3.
- Next week's tasks are limited to 3.
- Users type the tasks themselves.
- No automation is required for generating tasks in R3.4.
- Tasks do not need to link to KRs.
- Tasks are lightweight work summaries, not Jira tickets.
- Each task should have a progress scale so the user can update progress through the week.
```

Recommended progress scale:

```text
0% / 25% / 50% / 75% / 100%
```

or a slider from:

```text
0 to 100
```

---

## 7.9 KR Updates

KR updates are the weekly mechanism for changing KR progress.

```text
kr_updates
- id
- weekly_report_id
- key_result_id
- user_id
- monthly_target_id
- previous_value
- new_value
- progress_percent
- confidence_score
- status
- pacing_status
- update_note
- blocker
- created_at
```

Business rules:

```text
- Weekly Report should show all KRs related to the user.
- Related KRs include KRs owned by the user and KRs assigned to the user.
- User can update KRs from the KR Update section.
- Updating a KR creates a kr_update record.
- Creating a KR update updates key_results.current_value.
- Creating a KR update updates key_results.progress_percent.
- Creating a KR update updates key_results.confidence_score.
- Creating a KR update updates key_results.status.
- Creating a KR update recalculates pacing_status.
```

If the existing system already uses `check_ins`, the engineering team may either:

```text
Option A: Rename check_ins to kr_updates.
Option B: Keep check_ins as the database table and rename the UI label to KR Updates.
```

For implementation speed, Option B is acceptable.

---

## 7.10 Comments

Comments should support manager-employee communication.

```text
comments
- id
- object_type
- object_id
- author_id
- recipient_id
- content
- visibility
- created_at
- updated_at
```

Allowed object types:

```text
OBJECTIVE
KEY_RESULT
MONTHLY_TARGET
WEEKLY_REPORT
WEEKLY_TASK
KR_UPDATE
```

Allowed visibility values:

```text
PRIVATE_TO_MANAGER_CHAIN
VISIBLE_TO_OWNER_AND_MANAGER
EXECUTIVE_VISIBLE
```

R3.4 Weekly Report comment behavior:

```text
- Weekly Report has a comment section.
- The comment section is primarily for communication between the report owner and the person managing/reviewing them.
- Manager can comment on weekly report.
- Employee can reply.
- Comments should be visible to the relevant manager chain based on permissions.
```

---

## 7.11 Reviews

Manager review can remain lightweight.

```text
reviews
- id
- weekly_report_id
- reviewer_id
- review_status
- comment
- created_at
- updated_at
```

Allowed review statuses:

```text
APPROVED
NEEDS_FOLLOW_UP
FLAGGED_RISK
```

---

## 7.12 Notifications

```text
notifications
- id
- user_id
- type
- title
- message
- object_type
- object_id
- is_read
- created_at
```

Notification types:

```text
WEEKLY_REPORT_REMINDER
WEEKLY_REPORT_SUBMITTED
WEEKLY_REPORT_OVERDUE
REVIEW_REQUESTED
FOLLOW_UP_REQUESTED
KR_AT_RISK
KR_BLOCKED
MANAGER_COMMENT
CEO_COMMENT
```

---

## 7.13 Audit Logs

```text
audit_logs
- id
- actor_id
- action
- object_type
- object_id
- old_value
- new_value
- created_at
```

Audit logs should track important changes to:

```text
- Objectives
- KRs
- Monthly targets
- Weekly reports
- KR updates
- Reviews
- Org structure
- Permissions
```

---

## 8. Core Business Rules

### Rule 1: No child objectives in active R3.4 workflow

All objectives should be parallel.

```text
- Do not show Create Child Objective.
- Do not show Child Objective Proposal.
- Do not require parent-child objective assignment.
- Do not calculate objective health from child objectives.
```

---

### Rule 2: Objectives have defined KRs

When an objective is defined, it should have KRs that describe how success is measured.

```text
Objective → defined KRs
```

Each KR can then be assigned to a responsible user.

---

### Rule 3: Owned objectives must include KR-related objectives

For every user, My OKR / Owned Objectives should show:

```text
1. Objectives directly owned by the user.
2. Objectives linked to KRs assigned to the user.
```

Display tags:

```text
OWNER
ASSIGNED_KR
```

Editing rule:

```text
- OWNER objective: editable if user has permission.
- ASSIGNED_KR objective: read-only objective context.
- Assigned user may update only their KR, monthly targets, and weekly KR updates if permitted.
```

---

### Rule 4: KR assignment uses org tree visibility

When assigning a KR to someone:

```text
- The assigner can only select people under them in the company org tree.
- CEO / authorized executives can assign across the company.
- Admin can assign according to admin permission.
- Managers cannot assign KRs to people outside their allowed org subtree.
```

The people picker should only show eligible users.

Backend must enforce this rule.

---

### Rule 5: Company tree visibility is scoped

Everyone should have access to a company tree view, but the visible scope depends on role.

```text
Employee:
- See self and people under them, if any.

Manager:
- See self, direct reports, and all people below their direct reports.

Department Head:
- See department subtree.

CEO / Executive:
- See full company tree.

Admin:
- See full company tree.
```

The company tree must not reveal the entire organization to every employee.

---

### Rule 6: Weekly Report has three sections

Weekly Report should have exactly these major sections:

```text
1. This week's tasks
2. Next week's tasks
3. KR update section
```

This week's tasks:

```text
- Maximum 3 tasks.
- User types manually.
- Each task has progress scale.
```

Next week's tasks:

```text
- Maximum 3 tasks.
- User types manually.
- Each task has progress scale, default 0%.
```

KR update section:

```text
- Show related KRs.
- Let user update KR progress, value, status, confidence, blocker, and note.
```

---

### Rule 7: No Weekly Plan module

R3.3 introduced a Weekly Plan vs Weekly Report separation. R3.4 replaces that with a simpler model:

```text
Weekly Report only.
No separate Weekly Plan page.
No weekly planning workflow.
No carry-over automation required.
```

Next week's tasks inside the Weekly Report are enough for now.

---

### Rule 8: Weekly Report title is current monthly target

The Weekly Report should be organized around the active monthly target.

```text
Weekly Report
→ Monthly Target
→ KR
→ Objective
```

If the user has multiple monthly targets, the UI should group KR updates by monthly target.

---

### Rule 9: Monthly targets are required for pacing

```text
If no monthly target exists:
    pacing_status = NO_TARGET
```

Monthly targets should be created for each KR:

```text
Month 1
Month 2
Month 3
```

---

### Rule 10: Separate task progress from KR progress

Task completion does not automatically update KR progress.

```text
Task progress = work completion.
KR progress = measurable KR movement.
```

KR progress changes only through the KR Update section.

---

### Rule 11: Objective health calculation from direct KRs

Objective health should be calculated from direct KRs only.

Example logic:

```text
If all KRs are COMPLETED:
    objective_health_status = COMPLETED

Else if any KR is BLOCKED:
    objective_health_status = BLOCKED or AT_RISK

Else if majority of KRs are BEHIND:
    objective_health_status = BEHIND

Else if any KR is AT_RISK or confidence_score <= 2:
    objective_health_status = AT_RISK

Else if no KR has an update for the current period:
    objective_health_status = NO_UPDATE

Else:
    objective_health_status = ON_TRACK
```

Objective progress:

```text
objective_progress = weighted average of direct KR progress
```

If no KR weights exist:

```text
objective_progress = average of direct KR progress
```

---

### Rule 12: Manager review routing

When a weekly report is submitted:

```text
1. Find user's review_owner_id.
2. If review_owner_id is empty, use primary_manager_id.
3. Create pending review for that person.
4. Notify reviewer.
```

CEO should not review every weekly report unless they are the review owner or the item is escalated.

---

## 9. Permissions

Authorization must be enforced by the backend.

### 9.1 CEO / Executive

Can:

```text
- View all users.
- View all departments and teams.
- View full company tree.
- View all objectives and KRs.
- View all weekly reports.
- View executive dashboard.
- Comment on objectives, KRs, and reports.
- Assign KRs across the company if allowed by role.
```

### 9.2 Department Head

Can:

```text
- View own department subtree.
- View department objectives and KRs.
- View weekly reports within department scope.
- Review or comment on department-level items.
- Assign KRs to people under their org scope.
```

### 9.3 Manager

Can:

```text
- View direct reports and people below them in org tree.
- View team objectives and KRs within scope.
- Assign KRs to people under them.
- View and review assigned weekly reports.
- Comment on weekly reports and KRs.
```

### 9.4 Employee

Can:

```text
- View own profile.
- View own objectives.
- View objectives linked to assigned KRs.
- View own assigned KRs.
- Create monthly targets for assigned KRs if allowed.
- Create and submit own weekly reports.
- Add this week's tasks and next week's tasks.
- Create KR updates for assigned KRs.
- View manager comments on own reports.
```

Cannot:

```text
- Edit KR-related objective context unless they own the objective or have permission.
- Assign KRs to people outside their org scope.
- View full company tree unless permitted by role.
```

### 9.5 Admin

Can:

```text
- Manage users.
- Manage departments and teams.
- Manage roles.
- Import organization structure.
- View full company tree.
- Manage system settings.
```

---

## 10. Frontend Pages

The frontend should use the simplified navigation.

```text
/dashboard
/okr/company
/okr/my
/weekly-report
```

Admin pages may exist but should not appear for normal users.

```text
/admin/users
/admin/departments
/admin/teams
/admin/org-import
/admin/roles
/admin/quarters
```

### 10.1 Dashboard Page

Route:

```text
/dashboard
```

Role-aware dashboard.

Employee dashboard should show:

```text
- Current weekly report status
- Active monthly targets
- Assigned KRs
- KR status, confidence, pacing
- Blockers
- Manager comments
```

Manager dashboard should show:

```text
- Direct reports
- Submitted reports awaiting review
- Missing weekly reports
- KRs by status
- KRs by pacing
- Blocked or low-confidence KRs
```

CEO dashboard should show:

```text
- Total objectives
- Total KRs
- KRs On Pace
- KRs Behind
- KRs Blocked
- Average confidence
- Missing weekly reports
- Department health table
- High-risk KR list
- Latest blockers
```

---

### 10.2 Company OKR Page

Route:

```text
/okr/company
```

Show:

```text
- Company objectives
- Objective health
- Objective progress
- Direct KRs under each objective
- KR owners
- KR monthly targets
- KR status / pacing / confidence
```

Actions:

```text
- Create objective
- Edit objective if permitted
- Add KR to objective
- Assign KR owner within org permission scope
- View KR detail
```

No child objective actions should be shown.

---

### 10.3 My OKR Page

Route:

```text
/okr/my
```

Show two groups or one list with tags:

```text
1. Owned Objectives
2. Assigned KR Related Objectives
```

Each objective card should display a tag:

```text
OWNER
ASSIGNED_KR
```

For OWNER objectives:

```text
- User can edit objective if authorized.
- User can manage KRs if authorized.
```

For ASSIGNED_KR objectives:

```text
- Objective context is read-only.
- User can open the assigned KR.
- User can update KR progress if they own the KR.
- User can create or update monthly targets if allowed.
```

---

### 10.4 Weekly Report Page

Route:

```text
/weekly-report
```

The page should include:

```text
Title: current monthly target
Section 1: This week's tasks
Section 2: Next week's tasks
Section 3: KR update section
Comment section
Submit button
```

#### Section 1: This week's tasks

Requirements:

```text
- Maximum 3 tasks.
- User manually types task content.
- Each task has progress scale.
- Each task has optional blocker.
- User can update during the week.
```

#### Section 2: Next week's tasks

Requirements:

```text
- Maximum 3 tasks.
- User manually types task content.
- Each task has progress scale.
- Default progress should be 0%.
```

#### Section 3: KR update section

Requirements:

```text
- Show related KRs.
- Group by monthly target if useful.
- Show linked objective.
- Show previous value and current value.
- Allow new value update.
- Allow progress percent update.
- Allow confidence update.
- Allow status update.
- Allow blocker/note update.
```

#### Comment section

Requirements:

```text
- Employee can leave comment for manager.
- Manager can leave comment for employee.
- Comments remain attached to the weekly report.
```

---

### 10.5 Organization Tree View

Route suggestion:

```text
/okr/org-tree
```

or accessible inside Dashboard / OKR.

Requirements:

```text
- Show the visible company tree based on the current user's scope.
- Do not reveal full company tree to every employee.
- Show name, title, department, team, and manager relationship.
- Allow managers to understand who is under them.
- Use the same org tree scope for KR assignment people picker.
```

---

## 11. Backend API Requirements

The exact API style can be REST or GraphQL. REST is recommended.

### 11.1 Auth APIs

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

---

### 11.2 User APIs

```text
GET    /api/users/me
GET    /api/users
GET    /api/users/:id
POST   /api/users
PATCH  /api/users/:id
GET    /api/users/:id/okrs
GET    /api/users/:id/weekly-reports
GET    /api/users/:id/visible-org-scope
```

---

### 11.3 Organization APIs

```text
GET    /api/org/departments
POST   /api/org/departments
PATCH  /api/org/departments/:id
GET    /api/org/departments/:id/teams
POST   /api/org/teams
PATCH  /api/org/teams/:id
GET    /api/org/teams/:id/users
GET    /api/org/tree
GET    /api/org/tree/visible
GET    /api/org/assignable-users
POST   /api/org/import
```

`/api/org/tree/visible` should return only the organization subtree visible to the current user.

`/api/org/assignable-users` should return only users the current user can assign KRs to.

---

### 11.4 Objective APIs

```text
POST   /api/objectives
GET    /api/objectives
GET    /api/objectives/:id
PATCH  /api/objectives/:id
DELETE /api/objectives/:id
GET    /api/objectives/company/:year/:quarter
GET    /api/objectives/my
GET    /api/objectives/:id/key-results
GET    /api/objectives/:id/health
```

Deprecated for R3.4 active UI:

```text
GET /api/objectives/tree
POST child objective endpoints
objective assignment proposal endpoints
```

---

### 11.5 Key Result APIs

```text
POST   /api/key-results
GET    /api/key-results
GET    /api/key-results/:id
PATCH  /api/key-results/:id
DELETE /api/key-results/:id
GET    /api/key-results/:id/monthly-targets
GET    /api/key-results/:id/updates
GET    /api/key-results/risk-list
GET    /api/key-results/my-related
POST   /api/key-results/:id/assign
```

Assignment validation:

```text
- Backend checks whether assignee is inside assigner's allowed org scope.
```

---

### 11.6 Monthly Target APIs

```text
POST   /api/monthly-targets
GET    /api/key-results/:id/monthly-targets
PATCH  /api/monthly-targets/:id
DELETE /api/monthly-targets/:id
GET    /api/monthly-targets/current
GET    /api/monthly-targets/my-current
```

---

### 11.7 Weekly Report APIs

```text
POST   /api/weekly-reports
GET    /api/weekly-reports/current
GET    /api/weekly-reports/:id
PATCH  /api/weekly-reports/:id
POST   /api/weekly-reports/:id/submit
GET    /api/weekly-reports/user/:userId
GET    /api/weekly-reports/team/:teamId
GET    /api/weekly-reports/pending-review
```

---

### 11.8 Weekly Task APIs

```text
POST   /api/weekly-tasks
PATCH  /api/weekly-tasks/:id
DELETE /api/weekly-tasks/:id
GET    /api/weekly-reports/:id/tasks
```

Validation:

```text
- Maximum 3 THIS_WEEK tasks per report.
- Maximum 3 NEXT_WEEK tasks per report.
- progress_percent must be 0-100.
```

---

### 11.9 KR Update APIs

```text
POST   /api/kr-updates
GET    /api/kr-updates/:id
GET    /api/kr-updates/kr/:krId
GET    /api/kr-updates/user/:userId
GET    /api/weekly-reports/:id/kr-updates
```

If retaining old `check_ins` implementation:

```text
POST   /api/check-ins
GET    /api/check-ins/:id
GET    /api/check-ins/kr/:krId
GET    /api/check-ins/user/:userId
```

The UI should label these as KR Updates.

---

### 11.10 Review APIs

```text
GET    /api/reviews/pending
POST   /api/reviews
PATCH  /api/reviews/:id
GET    /api/reviews/history
```

---

### 11.11 Comment APIs

```text
POST   /api/comments
GET    /api/comments
GET    /api/comments/object/:objectType/:objectId
PATCH  /api/comments/:id
DELETE /api/comments/:id
```

---

### 11.12 Dashboard APIs

```text
GET /api/dashboard
GET /api/dashboard/employee
GET /api/dashboard/manager
GET /api/dashboard/ceo
GET /api/dashboard/company-health
GET /api/dashboard/risk-items
GET /api/dashboard/missing-updates
GET /api/dashboard/executive-summary
```

---

### 11.13 Notification APIs

```text
GET   /api/notifications
PATCH /api/notifications/:id/read
POST  /api/notifications/mark-all-read
```

---

## 12. Main User Flows

## 12.1 Create Objective Flow

```text
1. User opens OKR.
2. User selects Company OKR or My OKR based on context.
3. User clicks Create Objective.
4. User enters objective title, description, level, quarter, year, owner.
5. User defines KRs under the objective.
6. User assigns KR owners.
7. System validates KR owners based on assigner's org tree permission.
8. System saves objective and KRs.
9. Assigned KR owners see the linked objective in My OKR with ASSIGNED_KR tag.
```

Acceptance criteria:

```text
- Create Objective is inside OKR, not a separate menu.
- No child objective option appears.
- Objective can have multiple direct KRs.
- KR owner is required.
- KR assignee picker only shows people under the assigner.
- Assigned user sees linked objective as read-only context unless they own it.
```

---

## 12.2 My OKR Flow

```text
1. User opens OKR → My OKR.
2. System loads objectives owned by the user.
3. System loads objectives connected to KRs assigned to the user.
4. System displays each objective with OWNER or ASSIGNED_KR tag.
5. User can edit OWNER objectives if authorized.
6. User can view ASSIGNED_KR objectives but cannot edit objective details.
7. User can open and update assigned KRs.
8. User can create or update monthly targets for assigned KRs if allowed.
```

Acceptance criteria:

```text
- Owned Objectives includes self-created/self-owned objectives.
- Owned Objectives also includes objectives linked to assigned KRs.
- Tags distinguish ownership type.
- KR-related objectives are not editable unless user has objective permission.
```

---

## 12.3 Monthly Target Flow

```text
1. User receives or owns a KR.
2. User opens the KR detail page.
3. System shows Month 1, Month 2, and Month 3 target slots.
4. User fills in target_value and/or target_percent for each month.
5. System saves monthly targets.
6. Weekly Report uses the current monthly target as report title or grouping.
7. Pacing uses current monthly target.
```

Acceptance criteria:

```text
- Each KR supports three monthly targets.
- Monthly targets are visible on KR detail page.
- Monthly targets are visible in Weekly Report KR update section.
- Missing monthly target produces NO_TARGET pacing.
```

---

## 12.4 Weekly Report Flow

```text
1. User opens Weekly Report.
2. System creates or loads current weekly report.
3. Report title shows current monthly target.
4. User fills up to 3 tasks for this week.
5. User updates progress for each this-week task.
6. User fills up to 3 tasks for next week.
7. User reviews related KRs in KR Update section.
8. User updates KR value, progress, confidence, status, note, and blocker.
9. User optionally writes a comment to manager.
10. User submits weekly report.
11. System routes report to review owner / manager.
12. Manager receives notification.
```

Acceptance criteria:

```text
- Weekly Report has three sections: this week's tasks, next week's tasks, KR update section.
- This week's tasks are limited to 3.
- Next week's tasks are limited to 3.
- Tasks are manually typed.
- Each task has progress scale.
- KR update section shows related KRs.
- KR update changes KR progress only through explicit KR update.
- Comment section supports manager communication.
```

---

## 12.5 Manager Review / Comment Flow

```text
1. Manager opens Dashboard or Weekly Report review queue.
2. System shows submitted reports from people they manage or review.
3. Manager opens a report.
4. Manager reviews this week's tasks, next week's tasks, and KR updates.
5. Manager leaves comment.
6. Manager approves, requests follow-up, or flags risk.
7. Employee sees manager comment and review status.
8. Risk items appear in dashboards if applicable.
```

Acceptance criteria:

```text
- Manager only reviews authorized reports.
- Manager can comment on weekly report.
- Employee can see and reply to manager comments.
- Manager can mark report reviewed or needs follow-up.
```

---

## 12.6 Organization Tree Flow

```text
1. User opens organization tree view.
2. System calculates visible org scope based on role and manager relationship.
3. System displays only allowed people.
4. User can inspect people below them.
5. KR assignment people picker uses same scope rules.
```

Acceptance criteria:

```text
- Employee does not see full company tree by default.
- Manager sees people under them.
- CEO / Admin can see full tree.
- Backend enforces visibility scope.
```

---

## 13. Pacing and Health Calculations

## 13.1 KR Pacing

Basic calculation:

```text
If no monthly target exists:
    pacing_status = NO_TARGET

Else if no current-week KR update exists:
    pacing_status = NO_UPDATE

Else if progress_percent >= current month target_percent:
    pacing_status = ON_PACE

Else:
    pacing_status = BEHIND
```

Optional advanced logic:

```text
If current progress is significantly above target:
    pacing_status = AHEAD
```

---

## 13.2 Objective Progress

Objective progress is calculated from direct KRs.

```text
If KR weights exist and total weight = 100:
    objective_progress = weighted average of direct KR progress

Else:
    objective_progress = average of direct KR progress
```

---

## 13.3 Objective Health

Suggested logic:

```text
If no KRs:
    objective_health_status = NO_UPDATE

Else if all KRs are COMPLETED:
    objective_health_status = COMPLETED

Else if any KR is BLOCKED:
    objective_health_status = BLOCKED

Else if majority of KRs are BEHIND:
    objective_health_status = BEHIND

Else if any KR is AT_RISK:
    objective_health_status = AT_RISK

Else if any KR confidence_score <= 2:
    objective_health_status = AT_RISK

Else if majority of KRs have NO_UPDATE:
    objective_health_status = NO_UPDATE

Else:
    objective_health_status = ON_TRACK
```

---

## 13.4 Risk Detection

A KR should be marked as a risk item if any are true:

```text
pacing_status = BEHIND
status = AT_RISK
status = BEHIND
status = BLOCKED
confidence_score <= 2
no KR update this week
current date is close to due date and progress is low
```

---

## 14. Release Plan

The project has already completed earlier releases. Do not rewrite earlier completed releases unless needed for compatibility.

---

# Release 1 — Completed Historical Baseline

Release 1 established the original MVP:

```text
- Basic auth
- Organization management
- Objective and KR management
- Monthly targets
- Weekly reports
- Weekly priorities
- Check-ins
- Pacing calculation
- Manager review
- Basic dashboards
- Notifications
- Audit logs
```

R3.4 does not require redoing Release 1.

---

# Release 2 — Completed Historical Baseline

Release 2 improved execution intelligence and organization structure:

```text
- Company structure import
- Delegated review routing
- Review owner support
- Organization tree view
- Better risk detection
- Follow-up items
- Email notifications
- Advanced filters
- Dashboard export
```

R3.4 keeps the organization tree and delegated review routing, but changes how tree visibility is used for KR assignment.

---

# Release 3.1 — Completed Historical Baseline

Release 3.1 introduced advanced roll-up and weighted objective progress.

R3.4 keeps:

```text
- KR weight for direct objective progress calculation.
- Objective health calculation from KRs.
```

R3.4 deprecates active use of:

```text
- Child objective roll-up.
- Objective assignment contribution percentage.
- Parent-child objective progress calculation.
```

---

# Release 3.2 — Completed Historical Baseline, Superseded by R3.4

Release 3.2 introduced child objective proposal workflow.

R3.4 supersedes this workflow.

Do not build more child objective proposal features.

Remove or hide from active UI:

```text
- Create child objective
- Child objective proposal
- Assignment mode: CONTRIBUTION_ONLY
- Assignment mode: PREDEFINED_CHILD_OBJECTIVE
- Parent owner approval for child objective
- Child objective roll-up
```

Existing database structures may remain for compatibility, but should not be part of the active simplified workflow.

---

# Release 3.3 — Completed Historical Baseline, Superseded by R3.4

Release 3.3 separated Weekly Plan and Weekly Report.

R3.4 supersedes this workflow.

Do not continue building a separate Weekly Plan module.

Replace active workflow with:

```text
Weekly Report only
→ This week's tasks
→ Next week's tasks
→ KR update section
→ Manager comment
```

---

# Release 3.4 — Current Required Simplification Release

## R3.4 Goal

Simplify the product after leadership feedback.

The system should become easier to understand, easier to implement, and easier for DTEN employees to use.

R3.4 should focus on:

```text
1. Remove child objective workflow from active UI.
2. Simplify navigation.
3. Make objectives parallel.
4. Show assigned-KR-related objectives in My OKR.
5. Scope KR assignment by company org tree.
6. Add scoped company tree visibility.
7. Replace Weekly Plan with simplified Weekly Report.
8. Add monthly target as the organizing layer for weekly reports.
9. Add weekly report comment communication with manager.
10. Ensure objective health calculation works from direct KRs.
```

---

## R3.4 Functional Requirements

### R3.4.1 Remove Child Objective Function

Required:

```text
- Remove / hide Create Child Objective.
- Remove / hide Child Objective Proposal.
- Remove / hide parent objective assignment workflow.
- Prevent new objectives from requiring parent_objective_id.
- Objectives should display as parallel items.
```

Acceptance criteria:

```text
- User cannot create a child objective from the UI.
- Objective detail page does not show child objective proposal workflow.
- Objective progress is not calculated from child objectives.
- Objective health is calculated from direct KRs.
```

---

### R3.4.2 Simplify Main Menu

Required menu:

```text
Dashboard
OKR
Weekly Report
```

Under OKR:

```text
Company OKR
My OKR
```

Create Objective should be available inside OKR.

Acceptance criteria:

```text
- Sidebar has only Dashboard, OKR, Weekly Report for normal users.
- Create Objective is not a standalone menu item.
- Admin-only pages may be hidden behind admin access.
```

---

### R3.4.3 Objective and KR Structure

Required:

```text
- All objectives are parallel.
- Each objective has direct KRs.
- KRs define how the objective is measured.
- Objective health comes from direct KRs.
```

Acceptance criteria:

```text
- Objective list does not require tree structure.
- Objective detail shows direct KRs.
- Objective progress uses weighted or average KR progress.
```

---

### R3.4.4 My OKR / Owned Objective Behavior

Required:

```text
- Show objectives owned by current user.
- Show objectives linked to KRs assigned to current user.
- Add tag to distinguish OWNER vs ASSIGNED_KR.
- Read-only lock for assigned-KR-related objective context.
```

Acceptance criteria:

```text
- If a KR is assigned to user A, user A sees the linked objective in My OKR.
- The linked objective displays ASSIGNED_KR tag.
- User A cannot edit the linked objective unless user A is also the objective owner or has edit permission.
- User A can update their assigned KR and monthly targets if allowed.
```

---

### R3.4.5 KR Assignment Org Scope

Required:

```text
- When assigning a KR, the user picker only shows people under the assigner.
- Backend validates assignment scope.
- CEO / Admin can assign across company if allowed.
```

Acceptance criteria:

```text
- Manager cannot assign KR to a user outside their org subtree.
- Employee cannot see unrelated employees in assignment picker.
- API rejects out-of-scope KR assignment even if frontend is bypassed.
```

---

### R3.4.6 Scoped Company Tree View

Required:

```text
- Add company tree view somewhere accessible.
- Show only the people under the current user unless role allows broader access.
- Use this same org scope for KR assignment.
```

Acceptance criteria:

```text
- Employee sees only themselves and people below them.
- Manager sees their reporting subtree.
- CEO / Admin sees full company tree.
- Tree does not expose the entire company to everyone.
```

---

### R3.4.7 Monthly Target Functionality

Required:

```text
- Each KR has three monthly targets.
- When people receive KRs, they need to develop monthly targets.
- Monthly targets should be editable by KR owner / authorized users.
- Weekly report title should be current monthly target.
```

Acceptance criteria:

```text
- KR detail page shows Month 1, Month 2, Month 3 target fields.
- User can create monthly targets for assigned KR if allowed.
- Weekly report can show current monthly target as title.
- Pacing uses current monthly target.
```

---

### R3.4.8 Simplified Weekly Report

Required sections:

```text
1. This week's tasks
2. Next week's tasks
3. KR update section
```

This week's tasks:

```text
- Limit 3.
- Manual typing.
- Progress scale.
```

Next week's tasks:

```text
- Limit 3.
- Manual typing.
- Progress scale.
```

KR update section:

```text
- Show all related KRs.
- Let user update KR progress themselves.
- Show objective context and monthly target context.
```

Acceptance criteria:

```text
- No separate Weekly Plan page.
- Weekly Report contains all three sections.
- Tasks do not require KR linking.
- KR update section is where measurable KR progress changes.
```

---

### R3.4.9 Comment Section

Required:

```text
- Weekly Report includes comment section.
- Comment is used for employee-manager communication.
- Manager can comment on submitted report.
- Employee can see and reply.
```

Acceptance criteria:

```text
- Comment is attached to weekly report.
- Comment visibility follows manager/review-owner permissions.
- Comments can be displayed chronologically.
```

---

### R3.4.10 Objective Health Calculation

Required:

```text
- Objective health calculated from direct KRs.
- If any KR blocked, objective should be at risk or blocked.
- If majority KRs behind, objective should be behind.
- If all KRs completed, objective should be completed.
```

Acceptance criteria:

```text
- Objective detail shows calculated health.
- Dashboard uses calculated objective health.
- Health is recalculated when KR status/progress/confidence changes.
```

---

### R3.4.11 Simplified Direct-Report Tree View

#### Goal

The current company tree view is difficult to read because it attempts to show too much hierarchy at once.

For R3.4, the organization tree should be simplified into a visually clear “actual tree” UI that shows only the current user as the root node and one layer of direct reports below them.

This tree is not meant to show the full company hierarchy. It is meant to help each user quickly understand who is directly under them in the org structure.

#### Tree Scope

The org tree must follow this structure:

Current logged-in user
→ Direct reports only

The tree should not display:

- The current user’s manager
- Peers
- Indirect reports
- Other departments
- Full company structure
- Employees outside the current user’s visibility scope

Example:

```text
            Current User
          /      |       \
   Direct A   Direct B   Direct C

---

## R3.4 Non-Goals

R3.4 should not include:

```text
- AI summaries
- Jira-style task management
- Child objective proposal
- Separate weekly plan module
- Full objective cascading workflow
- Complex automation for task generation
- Auto carry-over of tasks
```

---

## R3.4 Build Priority for Codex / Engineering Agent

Build R3.4 in this order:

```text
1. Update sidebar navigation to Dashboard / OKR / Weekly Report.
2. Hide or remove child objective UI.
3. Update objective list/detail to treat objectives as parallel.
4. Update My OKR query to include objectives linked to assigned KRs.
5. Add OWNER / ASSIGNED_KR tags.
6. Lock editing for ASSIGNED_KR objective context.
7. Implement assignable users API based on org subtree.
8. Apply backend validation for KR assignment scope.
9. Add scoped company tree view.
10. Add or refine monthly target UI for each KR.
11. Update Weekly Report page to three sections.
12. Add weekly task limit validation.
13. Add KR update section to Weekly Report.
14. Add weekly report comment section.
15. Ensure KR updates recalculate pacing.
16. Ensure objective health recalculates from direct KRs.
17. Update dashboards to use simplified model.
18. Polish labels, permissions, and tests.
```

---

## R3.4 Definition of Done

R3.4 is complete when:

```text
1. Normal sidebar only shows Dashboard, OKR, and Weekly Report.
2. OKR contains Company OKR and My OKR.
3. Create Objective is part of OKR.
4. Users cannot create child objectives from the UI.
5. Objectives are displayed as parallel objectives.
6. Objective detail shows direct KRs.
7. My OKR shows both owned objectives and assigned-KR-related objectives.
8. OWNER and ASSIGNED_KR tags are visible.
9. Assigned-KR-related objectives are read-only unless user has edit permission.
10. KR assignment people picker only shows people under the assigner.
11. Backend rejects out-of-scope KR assignment.
12. Company tree view is scoped by role/org tree.
13. Each KR supports three monthly targets.
14. Weekly Report title uses current monthly target.
15. Weekly Report has this week's tasks, next week's tasks, and KR update section.
16. This week's tasks are limited to 3.
17. Next week's tasks are limited to 3.
18. Tasks have progress scale.
19. KR update section lets users update related KRs.
20. Weekly Report has employee-manager comment section.
21. Objective health is calculated from direct KRs.
22. Dashboard reflects simplified objective/KR/monthly target/weekly report model.
```

---

## 15. Updated UI Component Requirements

Reusable components:

```text
- StatusBadge
- ConfidenceScore
- PacingIndicator
- KRCard
- ObjectiveCard
- ObjectiveOwnershipTag
- MonthlyTargetCard
- MonthlyTargetEditor
- WeeklyReportForm
- WeeklyTaskEditor
- KRUpdateForm
- CommentThread
- ReviewPanel
- DashboardMetricCard
- RiskTable
- MissingUpdateTable
- DepartmentHealthTable
- OrgTreeView
- AssignableUserPicker
```

Deprecated / hidden components for active R3.4 UI:

```text
- ChildObjectiveProposalForm
- ObjectiveAssignmentContributionEditor
- WeeklyPlanForm
- CarryOverPriorityEditor
```

---

## 16. Suggested Frontend Structure

```text
src/
  app/ or pages/
    dashboard/
    okr/
      company/
      my/
      org-tree/
    weekly-report/
    admin/

  components/
    okr/
      ObjectiveCard
      KRCard
      ObjectiveOwnershipTag
      AssignableUserPicker
    monthly-target/
      MonthlyTargetCard
      MonthlyTargetEditor
    weekly-report/
      WeeklyReportForm
      WeeklyTaskEditor
      KRUpdateForm
      CommentThread
    dashboard/
    org/
      OrgTreeView
    review/
    common/

  services/
    apiClient.ts
    authService.ts
    okrService.ts
    keyResultService.ts
    monthlyTargetService.ts
    weeklyReportService.ts
    orgService.ts
    dashboardService.ts

  hooks/
    useCurrentUser.ts
    usePermissions.ts
    useOKRs.ts
    useMyOKRs.ts
    useAssignableUsers.ts
    useOrgTree.ts
    useWeeklyReport.ts

  types/
    user.ts
    okr.ts
    monthlyTarget.ts
    weeklyReport.ts
    dashboard.ts
    org.ts
```

---

## 17. Suggested Backend Structure

```text
backend/
  controllers/
    auth.controller
    users.controller
    org.controller
    objectives.controller
    keyResults.controller
    monthlyTargets.controller
    weeklyReports.controller
    weeklyTasks.controller
    krUpdates.controller
    comments.controller
    reviews.controller
    dashboard.controller
    notifications.controller

  services/
    auth.service
    users.service
    org.service
    orgScope.service
    objectives.service
    objectiveHealth.service
    keyResults.service
    monthlyTargets.service
    pacing.service
    weeklyReports.service
    weeklyTasks.service
    krUpdates.service
    comments.service
    reviews.service
    dashboard.service
    notifications.service
    auditLog.service

  repositories/
    users.repository
    objectives.repository
    keyResults.repository
    monthlyTargets.repository
    weeklyReports.repository
    weeklyTasks.repository
    krUpdates.repository
    comments.repository

  middleware/
    auth.middleware
    permission.middleware
    orgScope.middleware
    error.middleware

  jobs/
    weeklyReminder.job
    missingReport.job
    dashboardRefresh.job
```

---

## 18. Error Handling Requirements

Backend should return clear error messages for:

```text
- Unauthorized access.
- User cannot assign KR outside org scope.
- Missing KR owner.
- Missing monthly target.
- Invalid confidence score.
- Invalid status.
- Invalid task progress.
- More than 3 this-week tasks.
- More than 3 next-week tasks.
- User cannot edit read-only assigned-KR objective context.
- Weekly report already submitted.
- Manager cannot review this report.
```

Example API error shape:

```json
{
  "error": "VALIDATION_ERROR",
  "message": "This week's tasks are limited to 3.",
  "field": "weekly_tasks"
}
```

Example KR assignment error:

```json
{
  "error": "FORBIDDEN",
  "message": "You can only assign KRs to users under your organization scope."
}
```

---

## 19. Validation Rules

```text
confidence_score must be between 1 and 5.
progress_percent must be between 0 and 100.
target_percent must be between 0 and 100.
weekly_report.user_id is required.
weekly_task.weekly_report_id is required.
weekly_task.section_type is required.
weekly report can have max 3 THIS_WEEK tasks.
weekly report can have max 3 NEXT_WEEK tasks.
kr_update.key_result_id is required.
kr_update.weekly_report_id is required.
review.reviewer_id is required.
KR owner_id is required.
KR assignee must be inside assigner's org scope unless assigner has global permission.
```

---

## 20. Security Requirements

```text
- Passwords must never be stored in plain text.
- All backend routes must check authentication unless explicitly public.
- Permission checks must happen server-side.
- Org scope checks must happen server-side.
- Users should not access reports outside their permission scope.
- Users should not see full company tree unless authorized.
- Users should not assign KRs outside their org scope.
- Audit logs should record important business data changes.
```

---

## 21. Testing Requirements for R3.4

### 21.1 Navigation Tests

```text
- Normal employee sees Dashboard, OKR, Weekly Report only.
- Manager sees Dashboard, OKR, Weekly Report only, plus admin pages only if permitted.
- Create Objective appears inside OKR.
```

### 21.2 Child Objective Removal Tests

```text
- Create Child Objective button is not visible.
- Child objective proposal route is inaccessible or hidden.
- Objective detail does not show child objective proposal UI.
```

### 21.3 My OKR Tests

```text
- User sees objectives they own.
- User sees objectives linked to assigned KRs.
- OWNER tag appears correctly.
- ASSIGNED_KR tag appears correctly.
- Assigned-KR objective is read-only.
```

### 21.4 KR Assignment Scope Tests

```text
- Manager can assign KR to direct report.
- Manager can assign KR to indirect report under them if allowed.
- Manager cannot assign KR to person outside org subtree.
- Backend rejects out-of-scope assignment.
```

### 21.5 Org Tree Tests

```text
- Employee sees scoped tree only.
- Manager sees their subtree.
- CEO sees full tree.
- Admin sees full tree.
```

### 21.6 Weekly Report Tests

```text
- Weekly Report loads current monthly target title.
- User can add up to 3 this-week tasks.
- User cannot add 4th this-week task.
- User can add up to 3 next-week tasks.
- User cannot add 4th next-week task.
- Task progress scale saves correctly.
- KR update section shows related KRs.
- KR update changes KR current value and progress.
- Comment section saves and displays comments.
```

### 21.7 Objective Health Tests

```text
- Objective becomes COMPLETED when all KRs are completed.
- Objective becomes BLOCKED or AT_RISK when any KR is blocked.
- Objective becomes BEHIND when majority KRs are behind.
- Objective progress uses weighted KR average when weights total 100.
- Objective progress uses normal average when weights are missing.
```

---

## 22. Open Questions

These can be decided during implementation or later discussion:

```text
1. Should assigned KR owners always be allowed to edit monthly targets, or should manager approval be required?
2. Should weekly report title show one monthly target or group multiple monthly targets?
3. Should this week's tasks require a status field, or is progress scale enough?
4. Should manager comments be required before marking a report reviewed?
5. Should employees see indirect reports in the org tree if they are not managers?
6. Should objective owner be allowed to assign KRs to anyone under the objective owner, or only under their reporting tree?
7. Should KR assignment support multiple owners in the future?
```

Default R3.4 assumptions:

```text
- Assigned KR owner can update monthly targets unless restricted later.
- Weekly Report can group multiple monthly targets if user has multiple active KRs.
- Tasks use both progress scale and status.
- Manager comments are optional unless requesting follow-up.
- Org tree visibility is based on reporting subtree.
- KRs have one owner for now.
```

---

## 23. Final Product Summary

The updated DTEN OKR Weekly Execution System should be simpler than the previous PRD.

The active product model is:

```text
Parallel Objectives
→ Direct KRs
→ Three Monthly Targets per KR
→ Weekly Report
→ This Week's Tasks
→ Next Week's Tasks
→ KR Updates
→ Manager Comments
→ Dashboard
```

The system should avoid complex cascading objective workflows for now.

R3.4 should make the product easier for employees to understand and easier for engineering to finish.
