# DTEN OKR Weekly Execution System — Product & Development Requirements (PDR / PRD)

## 0. Document Purpose

This document defines the product, technical, and release requirements for the DTEN OKR Weekly Execution System.

The goal is to make this document implementation-ready so an engineering agent or developer can begin building the product directly in VS Code.

This system is not a generic task tracker. It is an OKR-driven weekly execution system that connects company objectives, key results, monthly checkpoints, weekly priorities, KR check-ins, manager review, and executive visibility.

---

## 1. Product Vision

DTEN needs a lightweight internal execution system that helps leadership track whether company goals are actually being executed week by week.

The system should solve this problem:

> DTEN should not wait until the end of a quarter to discover that an OKR is behind. Weekly execution updates should expose progress, blockers, confidence, and pacing early enough for managers and executives to take action.

---

## 2. Core Product Principle

Every weekly update should connect back to a measurable Key Result unless explicitly marked as ad-hoc.

The core execution chain is:

```text
Company Goal
→ Objective
→ Key Result
→ Monthly Checkpoint
→ Weekly Priority
→ Weekly Check-in
→ Manager Review
→ CEO Dashboard
```

---

## 3. Target Users

### 3.1 CEO / Executive

Needs to:

- Create or review company-level objectives.
- See company OKR health.
- Identify high-risk KRs.
- See missing weekly reports.
- Review blockers requiring leadership attention.
- Comment on high-risk items.

### 3.2 Department Head

Needs to:

- View department OKRs.
- Create department objectives aligned to company objectives.
- Review team progress.
- Identify KRs that are behind, blocked, or low confidence.

### 3.3 Manager / Team Lead

Needs to:

- View direct reports.
- Assign or manage KRs.
- Review weekly reports.
- Comment on execution progress.
- Request follow-up for at-risk items.

### 3.4 Individual Contributor / Employee

Needs to:

- View assigned objectives and KRs.
- Create weekly priorities.
- Link priorities to KRs.
- Submit weekly check-ins.
- Report progress, blockers, confidence, and next steps.
- Receive manager feedback.

### 3.5 Admin

Needs to:

- Manage users.
- Manage departments and teams.
- Manage roles and permissions.
- Configure quarters and system settings.

---

## 4. System Modules

The product should be divided into the following modules:

```text
1. Authentication & Authorization
2. Organization Management
3. OKR Management
4. Monthly Checkpoints
5. Weekly Execution
6. KR Check-ins & Pacing
7. Manager Review
8. Dashboard & Reporting
9. Notifications
10. Audit Logs
```

---

## 5. Recommended Technical Stack

The final stack can be adjusted by the engineering team, but the initial recommended stack is:

```text
Frontend: React or Next.js
Backend: Node.js/NestJS or Python/FastAPI
Database: PostgreSQL
Authentication: Company SSO later; local login acceptable for MVP
ORM: Prisma, TypeORM, SQLAlchemy, or equivalent
Deployment: Internal cloud/server environment
```

For a fast MVP, a full-stack framework such as Next.js with PostgreSQL and Prisma is acceptable.

---

## 6. Core Data Model

### 6.1 Users

Represents employees and leadership.

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

---

### 6.2 Departments

```text
departments
- id
- name
- lead_user_id
- created_at
- updated_at
```

---

### 6.3 Teams

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

### 6.4 Objectives

Objectives support top-down alignment through parent-child relationships.

```text
objectives
- id
- title
- description
- owner_id
- owner_type
- parent_objective_id
- level
- quarter
- year
- status
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
NOT_STARTED
ON_TRACK
AT_RISK
BEHIND
BLOCKED
COMPLETED
CANCELLED
```

---

### 6.5 Key Results

Key Result is the smallest measurable unit of OKR progress.

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
- rollup_mode
- status
- confidence_score
- pacing_status
- due_date
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

Allowed rollup modes:

```text
MANUAL
AUTO
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

---

### 6.6 Monthly Targets

Monthly targets are checkpoints, not final deadlines.

```text
monthly_targets
- id
- key_result_id
- month_index
- target_value
- target_percent
- checkpoint_note
- created_at
- updated_at
```

Allowed month indexes:

```text
1
2
3
```

For a quarterly OKR, month 1, month 2, and month 3 represent the three monthly checkpoints inside that quarter.

---

### 6.7 Weekly Reports

Weekly report is the weekly execution container for each user.

```text
weekly_reports
- id
- user_id
- week_start_date
- week_end_date
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

---

### 6.8 Weekly Priorities

Weekly priorities are the specific weekly work items inside a weekly report.

```text
weekly_priorities
- id
- weekly_report_id
- linked_kr_id
- priority_type
- content
- status
- result_summary
- blocker
- next_step
- created_at
- updated_at
```

Allowed priority types:

```text
KR_LINKED
AD_HOC
```

Allowed priority statuses:

```text
NOT_STARTED
IN_PROGRESS
COMPLETED
BLOCKED
CANCELLED
```

Business rule:

```text
If priority_type = KR_LINKED, linked_kr_id is required.
If priority_type = AD_HOC, linked_kr_id may be null.
```

---

### 6.9 Check-ins

Check-ins connect weekly execution to KR progress.

```text
check_ins
- id
- key_result_id
- weekly_report_id
- user_id
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

Business rule:

```text
A KR-linked weekly priority should create or update a check-in for the linked KR.
```

---

### 6.10 Reviews

Manager reviews should be structured, not only free-text comments.

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

### 6.11 Comments

Comments can attach to multiple object types.

```text
comments
- id
- object_type
- object_id
- author_id
- content
- created_at
- updated_at
```

Allowed object types:

```text
OBJECTIVE
KEY_RESULT
WEEKLY_REPORT
WEEKLY_PRIORITY
CHECK_IN
```

---

### 6.12 Notifications

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
CEO_COMMENT
```

---

### 6.13 Audit Logs

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

Audit logs should track important changes to objectives, KRs, check-ins, statuses, and reviews.

---

## 7. Core Business Rules

### Rule 1: Every KR must have an owner

A Key Result cannot be created without an owner.

---

### Rule 2: Every KR should have monthly targets

Monthly targets are required for full pacing calculation.

If no monthly target exists, pacing should be:

```text
NO_TARGET
```

---

### Rule 3: Weekly priorities must link to KRs unless ad-hoc

```text
If priority_type = KR_LINKED:
    linked_kr_id must not be null
```

---

### Rule 4: Weekly reports update KRs through check-ins

Weekly reports should not directly update objectives.

Correct flow:

```text
Weekly Report
→ Weekly Priority
→ Check-in
→ Key Result
→ Objective
→ Dashboard
```

---

### Rule 5: Separate progress, status, confidence, and pacing

The system must treat these as separate signals:

```text
Progress / Score:
Hard numerical progress.

Status:
Human or manager judgment of execution condition.

Confidence:
Owner's belief that the KR will be achieved.

Pacing:
System-calculated comparison against monthly checkpoint.
```

---

### Rule 6: Pacing calculation

Basic Release 1 pacing logic:

```text
If no monthly target exists:
    pacing_status = NO_TARGET

Else if no check-in exists for the current week:
    pacing_status = NO_UPDATE

Else if current progress_percent >= current month target_percent:
    pacing_status = ON_PACE

Else if current progress_percent < current month target_percent:
    pacing_status = BEHIND
```

Optional later logic:

```text
If current progress is significantly above target:
    pacing_status = AHEAD
```

---

### Rule 7: Risk detection

A KR should be marked as a risk item if any of the following are true:

```text
pacing_status = BEHIND
status = AT_RISK
status = BEHIND
status = BLOCKED
confidence_score <= 2
no check-in this week
current date is close to due date and progress is low
```

---

### Rule 8: Manager review required

Submitted weekly reports should appear in the manager's pending review list.

---

### Rule 9: CEO dashboard shows exceptions first

CEO dashboard should prioritize:

```text
Behind KRs
Blocked KRs
Low-confidence KRs
Missing weekly reports
Major blockers
Department health summary
```

---

## 8. Permissions

Authorization must be enforced by the backend, not only by frontend UI hiding.

### 8.1 CEO / Executive

Can:

- View all users.
- View all departments and teams.
- View all objectives and KRs.
- View all weekly reports.
- View executive dashboard.
- Comment on objectives and KRs.

### 8.2 Department Head

Can:

- View own department.
- View department teams and users.
- View department objectives and KRs.
- View weekly reports within department.
- Review or comment on department-level items.

### 8.3 Manager

Can:

- View direct reports.
- View team objectives and KRs.
- View and review direct reports' weekly reports.
- Comment on weekly reports and KRs.

### 8.4 Employee

Can:

- View own profile.
- View own assigned objectives and KRs.
- View aligned parent objectives.
- Create and submit own weekly reports.
- Create own weekly priorities.
- Create check-ins for assigned or linked KRs.
- View manager comments on own reports.

### 8.5 Admin

Can:

- Manage users.
- Manage departments and teams.
- Manage roles.
- Manage system settings.

---

## 9. Frontend Pages

### 9.1 Shared Layout

All authenticated users should have:

```text
- Sidebar navigation
- Top bar with current user
- Notifications indicator
- Role-aware navigation items
```

---

### 9.2 Employee Pages

```text
/my-dashboard
/my-okrs
/weekly-report/current
/weekly-report/history
/check-ins
/notifications
```

#### Employee Dashboard Requirements

Show:

```text
- Current week report status
- Assigned KRs
- KR statuses
- Confidence scores
- Pacing indicators
- Manager follow-ups
- Quick action: Submit weekly report
```

---

### 9.3 Manager Pages

```text
/team-dashboard
/team-okrs
/reviews/pending
/reviews/history
/team-risk-items
/missing-updates
```

#### Manager Dashboard Requirements

Show:

```text
- Direct reports
- Submitted reports awaiting review
- Missing weekly reports
- Team KRs by status
- Team KRs by pacing
- Blocked or low-confidence KRs
```

---

### 9.4 CEO / Executive Pages

```text
/company-dashboard
/company-okrs
/departments
/risk-items
/missing-updates
/executive-summary
```

#### CEO Dashboard Requirements

Show:

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

### 9.5 Admin Pages

```text
/admin/users
/admin/departments
/admin/teams
/admin/roles
/admin/quarters
```

---

## 10. Backend API Requirements

The exact API style can be REST or GraphQL. REST is recommended for Release 1.

### 10.1 Auth APIs

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

For Release 1, local auth or mock auth is acceptable.

---

### 10.2 User APIs

```text
GET    /api/users/me
GET    /api/users
GET    /api/users/:id
POST   /api/users
PATCH  /api/users/:id
GET    /api/users/:id/okrs
GET    /api/users/:id/weekly-reports
```

---

### 10.3 Organization APIs

```text
GET    /api/org/departments
POST   /api/org/departments
PATCH  /api/org/departments/:id
GET    /api/org/departments/:id/teams
POST   /api/org/teams
PATCH  /api/org/teams/:id
GET    /api/org/teams/:id/users
GET    /api/org/tree
```

---

### 10.4 Objective APIs

```text
POST   /api/objectives
GET    /api/objectives
GET    /api/objectives/:id
PATCH  /api/objectives/:id
DELETE /api/objectives/:id
GET    /api/objectives/tree
GET    /api/objectives/company/:year/:quarter
```

---

### 10.5 Key Result APIs

```text
POST   /api/key-results
GET    /api/key-results
GET    /api/key-results/:id
PATCH  /api/key-results/:id
DELETE /api/key-results/:id
GET    /api/key-results/:id/check-ins
GET    /api/key-results/risk-list
```

---

### 10.6 Monthly Target APIs

```text
POST   /api/monthly-targets
GET    /api/key-results/:id/monthly-targets
PATCH  /api/monthly-targets/:id
DELETE /api/monthly-targets/:id
```

---

### 10.7 Weekly Report APIs

```text
POST   /api/weekly-reports
GET    /api/weekly-reports/current
GET    /api/weekly-reports/:id
PATCH  /api/weekly-reports/:id
POST   /api/weekly-reports/:id/submit
GET    /api/weekly-reports/user/:userId
GET    /api/weekly-reports/team/:teamId
```

---

### 10.8 Weekly Priority APIs

```text
POST   /api/weekly-priorities
PATCH  /api/weekly-priorities/:id
DELETE /api/weekly-priorities/:id
GET    /api/weekly-reports/:id/priorities
```

---

### 10.9 Check-in APIs

```text
POST   /api/check-ins
GET    /api/check-ins/:id
GET    /api/check-ins/kr/:krId
GET    /api/check-ins/user/:userId
```

---

### 10.10 Review APIs

```text
GET    /api/reviews/pending
POST   /api/reviews
PATCH  /api/reviews/:id
GET    /api/reviews/history
```

---

### 10.11 Dashboard APIs

```text
GET /api/dashboard/employee
GET /api/dashboard/manager
GET /api/dashboard/ceo
GET /api/dashboard/company-health
GET /api/dashboard/risk-items
GET /api/dashboard/missing-updates
GET /api/dashboard/executive-summary
```

---

### 10.12 Notification APIs

```text
GET   /api/notifications
PATCH /api/notifications/:id/read
POST  /api/notifications/mark-all-read
```

---

## 11. Main User Flows

### 11.1 Employee Weekly Report Flow

```text
1. Employee logs in.
2. Employee opens My Dashboard.
3. System shows current weekly report status.
4. Employee opens Weekly Report page.
5. Employee adds weekly priorities.
6. For each KR-linked priority, employee selects a linked KR.
7. Employee updates priority status, result summary, blocker, and next step.
8. Employee creates KR check-in.
9. Employee submits weekly report.
10. System updates KR progress, confidence, status, and pacing.
11. System notifies manager.
```

Acceptance criteria:

```text
- Employee cannot submit KR-linked priority without linked KR.
- Employee can mark priority as ad-hoc.
- Employee can submit check-in with progress, confidence, status, and note.
- Submitted report appears in manager's pending review page.
```

---

### 11.2 Manager Review Flow

```text
1. Manager logs in.
2. Manager opens Pending Reviews.
3. System shows submitted weekly reports from direct reports.
4. Manager opens a report.
5. Manager reviews linked KRs, check-ins, blockers, and confidence.
6. Manager approves, requests follow-up, or flags risk.
7. System updates report review status.
8. System notifies employee.
9. Risk items appear in manager and CEO dashboards if applicable.
```

Acceptance criteria:

```text
- Manager can only review authorized reports.
- Manager can leave review comment.
- Manager can mark report as reviewed or needs follow-up.
- Employee can see manager feedback.
```

---

### 11.3 CEO Dashboard Flow

```text
1. CEO logs in.
2. CEO opens Company Dashboard.
3. System displays company-level OKR health.
4. CEO sees high-risk KRs first.
5. CEO opens a KR detail page.
6. CEO reads latest check-ins and blockers.
7. CEO comments or requests leadership follow-up.
```

Acceptance criteria:

```text
- CEO can view all objectives, KRs, reports, and risk items.
- Dashboard shows missing updates.
- Dashboard shows KRs grouped by department.
- Dashboard shows KRs behind monthly target.
- CEO comments create notifications for owner and manager.
```

---

## 12. Release Plan

The project should be delivered in multiple releases.

---

# Release 1 — Core OKR + Weekly Execution MVP

## Release 1 Goal

Build the minimum complete system that supports the original PRD's core requirements:

```text
- Organization hierarchy
- OKR and KR management
- Monthly KR checkpoints
- Weekly reports
- KR-linked weekly priorities
- KR check-ins
- Progress/status/confidence/pacing separation
- Manager review
- Basic leadership dashboard
```

Release 1 should prove the main execution loop:

```text
Objective → KR → Weekly Priority → Check-in → Manager Review → Dashboard
```

---

## Release 1 Functional Requirements

### R1.1 Authentication

Required:

```text
- Basic login/logout.
- Current user endpoint.
- Role stored on user.
```

Acceptable for MVP:

```text
- Local email/password auth.
- Seeded users for testing.
```

Not required yet:

```text
- SSO.
- MFA.
```

---

### R1.2 Organization Management

Required:

```text
- Create, edit, and view users.
- Create, edit, and view departments.
- Create, edit, and view teams.
- Assign users to departments and teams.
- Assign manager relationship.
- Assign user role.
```

Required pages:

```text
/admin/users
/admin/departments
/admin/teams
```

---

### R1.3 OKR Management

Required:

```text
- Create objectives.
- Edit objectives.
- View objective list.
- View objective detail.
- Support parent objective relationship.
- Support objective level: Company, Department, Team, Individual.
- Create KRs under objectives.
- Assign KR owner.
- Edit KR current value, target value, status, confidence.
```

Required pages:

```text
/company-okrs
/my-okrs
/objectives/:id
/key-results/:id
```

---

### R1.4 Monthly Targets

Required:

```text
- Add month 1, month 2, month 3 targets for each KR.
- Store target value and/or target percent.
- Show monthly targets on KR detail page.
```

Required behavior:

```text
- If no monthly target exists, KR pacing = NO_TARGET.
```

---

### R1.5 Weekly Reports

Required:

```text
- Employee can create current week report.
- Employee can save report as draft.
- Employee can submit report.
- Report contains multiple weekly priorities.
- Report has status: Draft, Submitted, Reviewed, Needs Follow-up, Overdue.
```

Required pages:

```text
/weekly-report/current
/weekly-report/history
```

---

### R1.6 Weekly Priorities

Required:

```text
- Add priority content.
- Select priority type: KR-linked or Ad-hoc.
- If KR-linked, select linked KR.
- Update priority status.
- Add result summary.
- Add blocker.
- Add next step.
```

Validation:

```text
- Cannot submit KR-linked priority without linked KR.
```

---

### R1.7 KR Check-ins

Required:

```text
- Create check-in from weekly report.
- Check-in links to KR and weekly report.
- Check-in stores previous value, new value, progress percent, confidence, status, blocker, note.
- Creating check-in updates the related KR.
```

Required behavior:

```text
- New check-in updates key_results.current_value.
- New check-in updates key_results.progress_percent.
- New check-in updates key_results.confidence_score.
- New check-in updates key_results.status.
- New check-in recalculates key_results.pacing_status.
```

---

### R1.8 Pacing Calculation

Required basic calculation:

```text
If no monthly target exists:
    pacing_status = NO_TARGET

Else if no current-week check-in exists:
    pacing_status = NO_UPDATE

Else if progress_percent >= current month target_percent:
    pacing_status = ON_PACE

Else:
    pacing_status = BEHIND
```

---

### R1.9 Manager Review

Required:

```text
- Manager can see submitted reports from direct reports.
- Manager can open report detail.
- Manager can approve/review report.
- Manager can request follow-up.
- Manager can leave comment.
- Employee can see review result.
```

Required pages:

```text
/reviews/pending
/reviews/history
```

---

### R1.10 Dashboards

Required Employee Dashboard:

```text
- Current report status.
- Assigned KRs.
- KR status, confidence, pacing.
- Manager follow-ups.
```

Required Manager Dashboard:

```text
- Direct reports.
- Submitted reports pending review.
- Missing reports.
- Team KRs at risk.
```

Required CEO Dashboard:

```text
- Total objectives.
- Total KRs.
- KRs by status.
- KRs by pacing.
- Average confidence.
- Missing weekly reports.
- High-risk KR list.
```

---

### R1.11 Notifications

Required minimal in-app notifications:

```text
- Weekly report submitted to manager.
- Manager requested follow-up.
- Manager reviewed report.
- CEO/comment on KR.
```

Not required in R1:

```text
- Email notification.
- Slack/Teams notification.
```

---

### R1.12 Audit Logs

Required minimal audit logs for:

```text
- Objective created/updated.
- KR created/updated.
- Check-in created.
- Weekly report submitted.
- Manager review submitted.
```

---

## Release 1 Non-Functional Requirements

```text
- Application should be usable by internal DTEN employees.
- Basic role-based access control must exist.
- Pages should be responsive for laptop/desktop use.
- Backend must validate all important business rules.
- Database schema must support future releases without full rewrite.
- Seed data should be included for local development/demo.
```

---

## Release 1 Seed Data Requirements

Create seed data for local development:

```text
Users:
- CEO user
- Department head user
- Manager user
- Engineer user
- Sales user

Departments:
- Executive
- Product Engineering
- Sales
- Marketing

Teams:
- Android Team
- Certification Team
- Sales Team

Objectives:
- Company objective: Deliver predictable revenue growth
- Company objective: Re-establish product and solution leadership
- Department objective: Drive product certifications and GA readiness

Key Results:
- Ship D7X AI 55" to production
- Complete Microsoft Teams certification
- Deliver 15 qualified demos per week

Monthly Targets:
- M1, M2, M3 targets for each sample KR
```

---

## Release 1 Definition of Done

Release 1 is complete when:

```text
1. Users can log in.
2. Admin can create org hierarchy.
3. Objectives and KRs can be created and viewed.
4. KRs can have monthly targets.
5. Employees can submit weekly reports.
6. Weekly priorities can link to KRs.
7. Check-ins update KR progress.
8. Pacing is calculated from monthly targets.
9. Managers can review submitted reports.
10. CEO dashboard shows company OKR health and risk items.
11. Basic permissions are enforced by backend.
12. Seed data allows demo of the full workflow.
```

---

# Release 2 — Improved Execution Intelligence

## Release 2 Goal

Improve the system from basic tracking to smarter execution visibility.

## Release 2 Features

```text
- Better risk detection rules.
- Weekly executive summary generation.
- Trend view for confidence and progress.
- Department health comparison.
- Comment threads on KRs and reports.
- Follow-up task tracking.
- Email notifications.
- More advanced filtering and search.
- Export dashboard data to CSV.
```

## Release 2 Detailed Requirements

### R2.1 Trend Tracking

Show KR progress over time using check-in history.

```text
- Progress trend line.
- Confidence trend line.
- Status change history.
```

### R2.2 Follow-up Items

Managers and executives can create follow-up items from reviews or comments.

```text
follow_ups
- id
- source_object_type
- source_object_id
- owner_id
- assigned_by
- content
- due_date
- status
- created_at
- updated_at
```

### R2.3 Email Notifications

Send email for:

```text
- Weekly report overdue.
- Manager review requested.
- Follow-up assigned.
- KR becomes blocked.
```

### R2.4 Advanced Dashboard Filters

Filters:

```text
- Department
- Team
- Owner
- Status
- Confidence
- Pacing
- Quarter
```

---

# Release 3 — Alignment, Roll-up, and Automation

## Release 3 Goal

Improve OKR alignment, roll-up logic, and automation.

## Release 3 Features

```text
- Auto roll-up from child objectives/KRs.
- Weighted KR progress.
- Objective health calculation.
- Advanced permission model.
- Approval workflow for company-level OKRs.
- Slack/Teams integration.
- SSO integration.
```

### R3.1 Auto Roll-up

If KR rollup_mode = AUTO:

```text
KR progress = average or weighted average of linked child KRs/objectives.
```

### R3.2 Objective Health Calculation

Objective status can be calculated from child KR statuses:

```text
If any KR is BLOCKED:
    objective_status = AT_RISK or BLOCKED

If majority KRs are BEHIND:
    objective_status = BEHIND

If all KRs completed:
    objective_status = COMPLETED
```

### R3.3 SSO

Add company SSO using DTEN's preferred identity provider.

---

# Release 4 — AI Assistance and Executive Insights

## Release 4 Goal

Add AI-assisted summaries and decision support after core data quality is proven.

## Release 4 Features

```text
- AI-generated weekly executive summary.
- AI risk explanation.
- AI suggested manager follow-up questions.
- AI draft OKR suggestions.
- AI detection of vague weekly updates.
- Natural language search across OKRs and reports.
```

Important:

AI should not be added before the core workflow and data model are stable.

---

## 13. UI Component Requirements

Build reusable components:

```text
- StatusBadge
- ConfidenceScore
- PacingIndicator
- KRCard
- ObjectiveCard
- OKRTree
- WeeklyReportForm
- WeeklyPriorityEditor
- CheckInForm
- ReviewPanel
- DashboardMetricCard
- RiskTable
- MissingUpdateTable
- DepartmentHealthTable
```

---

## 14. Suggested Frontend Structure

```text
src/
  app/ or pages/
    dashboard/
    okrs/
    weekly-reports/
    reviews/
    admin/

  components/
    okr/
    weekly-report/
    dashboard/
    review/
    common/

  services/
    apiClient.ts
    authService.ts
    okrService.ts
    weeklyReportService.ts
    dashboardService.ts

  hooks/
    useCurrentUser.ts
    usePermissions.ts
    useOKRs.ts
    useWeeklyReport.ts

  types/
    user.ts
    okr.ts
    weeklyReport.ts
    dashboard.ts
```

---

## 15. Suggested Backend Structure

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
    weeklyPriorities.controller
    checkIns.controller
    reviews.controller
    dashboard.controller
    notifications.controller

  services/
    auth.service
    users.service
    org.service
    objectives.service
    keyResults.service
    pacing.service
    weeklyReports.service
    checkIns.service
    reviews.service
    dashboard.service
    notifications.service
    auditLog.service

  repositories/
    users.repository
    objectives.repository
    keyResults.repository
    weeklyReports.repository
    checkIns.repository

  middleware/
    auth.middleware
    permission.middleware
    error.middleware

  jobs/
    weeklyReminder.job
    missingReport.job
    dashboardRefresh.job
```

---

## 16. Error Handling Requirements

Backend should return clear error messages for:

```text
- Unauthorized access.
- Missing required KR link.
- Invalid confidence score.
- Invalid status.
- User does not own or cannot access KR.
- Weekly report already submitted.
- Manager cannot review this report.
```

Example API error shape:

```json
{
  "error": "VALIDATION_ERROR",
  "message": "KR-linked weekly priority requires linked_kr_id.",
  "field": "linked_kr_id"
}
```

---

## 17. Validation Rules

```text
confidence_score must be between 1 and 5.
progress_percent must be between 0 and 100.
target_percent must be between 0 and 100.
weekly_report.user_id is required.
weekly_priority.weekly_report_id is required.
weekly_priority.linked_kr_id is required when priority_type = KR_LINKED.
check_in.key_result_id is required.
check_in.weekly_report_id is required.
review.reviewer_id is required.
```

---

## 18. Security Requirements

```text
- Passwords must never be stored in plain text.
- All backend routes must check authentication unless explicitly public.
- Permission checks must happen server-side.
- Users should not be able to access reports outside their permission scope.
- Audit logs should record important business data changes.
```

---

## 19. Open Questions

These can be decided during implementation or later product discussion:

```text
1. Should confidence be 1-5 or 1-10?
2. Should CEO objectives require approval before publishing?
3. Should employees be allowed to create their own individual objectives?
4. Should manager review be required every week or optional?
5. Should ad-hoc work count toward execution health?
6. Should objective progress be manually updated or calculated from KRs?
7. Should weekly reports be based on calendar week or company-defined work week?
```

For Release 1, default assumptions:

```text
- Confidence uses 1-5.
- Manager review is required.
- Objective progress is manually shown, while KR progress is updated by check-ins.
- Weekly reports use Monday-Sunday work week.
- Ad-hoc work is visible but does not affect OKR progress.
```

---

## 20. Build Priority for Codex / Engineering Agent

Build Release 1 in this order:

```text
1. Project setup
2. Database schema
3. Seed data
4. Auth and current user
5. Organization CRUD
6. Objective CRUD
7. Key Result CRUD
8. Monthly Target CRUD
9. Weekly Report CRUD
10. Weekly Priority editor
11. Check-in creation and KR update logic
12. Pacing calculation
13. Manager review flow
14. Employee dashboard
15. Manager dashboard
16. CEO dashboard
17. Notifications
18. Audit logs
19. Polish and validation
```

---

## 21. Final Product Summary

The DTEN OKR Weekly Execution System should help the company operate with execution rigor.

The system connects:

```text
Strategic direction
→ measurable KRs
→ monthly checkpoints
→ weekly execution
→ check-ins
→ manager review
→ executive visibility
```

The first release should focus on building a reliable internal MVP that makes the weekly execution loop real. Later releases can add smarter analytics, stronger automation, integrations, and AI assistance.

