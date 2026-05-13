# DTEN OKR Concurrent Workflow Test Report up to Release 3.2

## Environment
- branch: `testing`
- commit hash: `be3cba3`
- test date: 2026-05-13
- database: local Docker Postgres via app Prisma schema, reset with `npm run prisma:seed` before the run
- app URL: `http://localhost:3000`
- test tools used: Playwright browser automation, Prisma direct consistency queries, custom QA scripts in `qa-simulation/`
- browser(s): Chromium via Playwright
- test account used for initial CEO login: `ceo@dten.com`

## Generated Organization CSV
File path: `qa-simulation/hr-structure-20-users.csv`

```csv
name,email,title,role,department,team,primary_manager_email,review_owner_email,employment_status,local_manager_email,location,office,employee_id,start_date,avatar_url
Maya Chen,ceo@dten.com,Chief Executive Officer,CEO,Executive,Executive Leadership,,,active,,San Jose CA,San Jose HQ,E2E-001,2020-01-06,
Victor Alvarez,coo.qa@dten.com,Chief Operating Officer,EXECUTIVE,Executive,Executive Operations,ceo@dten.com,ceo@dten.com,active,ceo@dten.com,San Jose CA,San Jose HQ,E2E-002,2020-03-02,
Nina Patel,head@dten.com,Head of Product Engineering,DEPARTMENT_HEAD,Product Engineering,Product Engineering Leadership,ceo@dten.com,ceo@dten.com,active,ceo@dten.com,San Jose CA,San Jose HQ,E2E-003,2021-02-01,
Owen Brooks,sales-head.qa@dten.com,Head of Sales,DEPARTMENT_HEAD,Sales,Sales Leadership,coo.qa@dten.com,ceo@dten.com,active,coo.qa@dten.com,Austin TX,Austin,E2E-004,2021-05-10,
Priya Raman,cs-head.qa@dten.com,Head of Customer Success,DEPARTMENT_HEAD,Customer Success,CS Leadership,coo.qa@dten.com,coo.qa@dten.com,active,coo.qa@dten.com,Denver CO,Denver,E2E-005,2021-08-16,
Elena Morris,marketing-head.qa@dten.com,Head of Marketing,DEPARTMENT_HEAD,Marketing,Marketing Leadership,coo.qa@dten.com,coo.qa@dten.com,active,coo.qa@dten.com,San Jose CA,San Jose HQ,E2E-006,2022-01-10,
Jordan Lee,people-admin.qa@dten.com,People Operations Admin,ADMIN,People,People Operations,coo.qa@dten.com,coo.qa@dten.com,active,coo.qa@dten.com,San Jose CA,San Jose HQ,E2E-007,2022-04-04,
Marcus Reed,manager@dten.com,Certification Team Manager,MANAGER,Product Engineering,Certification Team,head@dten.com,head@dten.com,active,head@dten.com,San Jose CA,San Jose HQ,E2E-008,2022-07-11,
Hannah Kim,android-manager.qa@dten.com,Android Team Manager,MANAGER,Product Engineering,Android Team,head@dten.com,head@dten.com,active,head@dten.com,San Jose CA,San Jose HQ,E2E-009,2022-09-19,
Luis Ortega,sales-manager.qa@dten.com,Enterprise Sales Manager,MANAGER,Sales,Enterprise Sales,sales-head.qa@dten.com,sales-head.qa@dten.com,active,sales-head.qa@dten.com,Austin TX,Austin,E2E-010,2022-11-07,
Grace Liu,cs-manager.qa@dten.com,Customer Success West Manager,MANAGER,Customer Success,Customer Success West,cs-head.qa@dten.com,cs-head.qa@dten.com,active,cs-head.qa@dten.com,Seattle WA,Seattle,E2E-011,2023-01-09,
Sam Torres,engineer@dten.com,Android Engineer,EMPLOYEE,Product Engineering,Android Team,android-manager.qa@dten.com,manager@dten.com,active,android-manager.qa@dten.com,Portland OR,Remote,E2E-012,2023-03-06,
Ivy Nguyen,platform-engineer.qa@dten.com,Platform Engineer,EMPLOYEE,Product Engineering,Android Team,android-manager.qa@dten.com,android-manager.qa@dten.com,active,android-manager.qa@dten.com,San Jose CA,San Jose HQ,E2E-013,2023-04-17,
Diego Santos,qa-engineer.qa@dten.com,QA Engineer,EMPLOYEE,Product Engineering,Certification Team,manager@dten.com,manager@dten.com,active,manager@dten.com,San Jose CA,San Jose HQ,E2E-014,2023-05-22,
Mei Zhao,cert-engineer.qa@dten.com,Certification Engineer,EMPLOYEE,Product Engineering,Certification Team,manager@dten.com,manager@dten.com,active,manager@dten.com,San Jose CA,San Jose HQ,E2E-015,2023-06-12,
Carla Mendez,sales@dten.com,Enterprise Account Executive,EMPLOYEE,Sales,Enterprise Sales,sales-manager.qa@dten.com,sales-manager.qa@dten.com,active,sales-manager.qa@dten.com,Austin TX,Austin,E2E-016,2023-07-10,
Ben Wright,sdr.qa@dten.com,Sales Development Representative,EMPLOYEE,Sales,Enterprise Sales,sales-manager.qa@dten.com,sales-manager.qa@dten.com,active,sales-manager.qa@dten.com,Austin TX,Austin,E2E-017,2023-08-14,
Amara Johnson,customer-success.qa@dten.com,Customer Success Manager,EMPLOYEE,Customer Success,Customer Success West,cs-manager.qa@dten.com,cs-manager.qa@dten.com,active,cs-manager.qa@dten.com,Seattle WA,Seattle,E2E-018,2023-09-05,
Noah Smith,demand-gen.qa@dten.com,Demand Generation Specialist,EMPLOYEE,Marketing,Demand Generation,marketing-head.qa@dten.com,marketing-head.qa@dten.com,active,marketing-head.qa@dten.com,San Jose CA,San Jose HQ,E2E-019,2023-10-02,
Taylor Reed,inactive-employee.qa@dten.com,Customer Success Associate,EMPLOYEE,Customer Success,Customer Success West,cs-manager.qa@dten.com,cs-manager.qa@dten.com,inactive,cs-manager.qa@dten.com,Seattle WA,Seattle,E2E-020,2022-02-14,
```

Note: the requested 20-user structure also asked for 1 CEO, 1 COO, 4 department heads, 1 People/HR Admin, 4 managers, and 10 employees. That sums to 21 if People/HR Admin is additional. I kept the CSV at exactly 20 users by including 9 active ICs plus 1 inactive employee.

## Import Result
- users created: 20 E2E users present after import
- users updated: seed accounts matching imported emails were updated, including `ceo@dten.com`, `head@dten.com`, `manager@dten.com`, `engineer@dten.com`, `sales@dten.com`
- inactive users: 1
- departments created: 6
- teams created: 9
- validation errors: invalid duplicate email, missing manager email, and invalid role imports were blocked without changing user count
- import summary screenshot/path if available: `qa-simulation/org-import-result.png`

## Summary
- total users simulated: 20
- concurrent sessions simulated: approximately 20 browser contexts across employees, managers, department heads, admin, and CEO workflows
- passed areas: CSV import, import validation rollback, org hierarchy data, weighted KR formula, child objective weighted roll-up, basic proposal submission, non-approved proposal exclusion from roll-up, most weekly report submissions, KR check-ins
- failed areas: manager review concurrency/idempotency, approved child objective status transition, one concurrent double-submit weekly report case, one permission boundary probe
- high-risk issues: duplicate manager reviews causing 10,711 review rows, 15,958 notifications, and 10,784 audit logs; approved proposal remains `APPROVED` instead of becoming `ACTIVE`
- overall readiness rating: needs major fixes before continuing development

## Test Coverage Checklist
- CSV org import: PASS
- org tree: PASS
- login/session isolation: PARTIAL
- delegated review routing: PARTIAL
- weekly reports: PARTIAL
- KR check-ins: PASS
- weighted KR progress: PASS
- parent/child objective roll-up: PASS
- child objective proposal workflow: PARTIAL
- manager review: FAIL
- CEO dashboard: PARTIAL
- manager dashboard: PARTIAL
- employee dashboard: PARTIAL
- executive summary: PARTIAL
- dashboard CSV export: PARTIAL
- permission boundaries: PARTIAL
- notifications: FAIL
- audit logs: FAIL

## Bugs Found

### Duplicate Manager Reviews From Repeated or Stale Review Submits
Severity: Critical
Area: Review Routing / Notifications / Audit Logs

Reproduction steps:
1. Import the 20-user org and have multiple employees submit weekly reports.
2. Open pending review pages as multiple managers.
3. Submit reviews concurrently or repeatedly from still-visible review forms.
4. Inspect `ManagerReview`, `Notification`, and `AuditLog` records.

Expected behavior:

Each weekly report should accept one current review action or safely update/replace the existing review. Once reviewed or marked for follow-up, it should leave the pending queue and stale form submissions should be rejected idempotently.

Actual behavior:

The manager review loop repeatedly posted `POST /reviews/pending 200` and created thousands of reviews for the same reports. Final observed counts:
- `ManagerReview`: 10,711
- duplicate reviews for report `cmp4nvopb002sk4tshexpwhz3`: 5,478
- duplicate reviews for report `cmp4nvs2i003ik4tspkehk5fi`: 5,227
- `Notification`: 15,958
- `AuditLog`: 10,784

Likely root cause:

`submitManagerReviewAction` appears to create review rows without checking whether the target report is still reviewable or already has a completed review. The pending review UI also appears able to submit stale forms after status changes.

Suggested fix location:

`src/app/reviews/actions.ts`, `src/app/reviews/pending/page.tsx`, and possibly a Prisma uniqueness/idempotency constraint for `ManagerReview.weeklyReportId` if the intended model is one active review per report.

Related files/APIs:

`POST /reviews/pending`, `ManagerReview`, `Notification`, `AuditLog`

Screenshots/logs if available:

Observed in `next-dev.log` as repeated `submitManagerReviewAction({})` calls and repeated `POST /reviews/pending 200`.

### Approved Child Objective Proposal Does Not Become Active
Severity: High
Area: Child Objective Proposal / Child Objective Roll-up

Reproduction steps:
1. Log in as CEO.
2. Create a parent objective with `progress_source = CHILD_OBJECTIVES`.
3. Assign contribution percentages to department heads.
4. Log in as assignees and submit child objective proposals.
5. Log back in as CEO and approve one proposal.
6. Inspect the child objective assignment/proposal status.

Expected behavior:

An approved child objective should become `ACTIVE`, and only active/approved children should affect parent roll-up.

Actual behavior:

The approved assignment stayed in status `APPROVED`, not `ACTIVE`. The roll-up did include only the approved assignment, but the state did not match the Release 3.2 workflow expectation.

Likely root cause:

The proposal review action likely stores the decision enum directly instead of transitioning the child objective into the active objective lifecycle state.

Suggested fix location:

`src/app/objectives/actions.ts`

Related files/APIs:

Child objective assignment review action, objective proposal status handling

Screenshots/logs if available:

Final observed proposal parent:
- approved assignment: `APPROVED`, contribution 50, child progress 60
- revision assignment: `NEEDS_REVISION`, contribution 30, child progress 40
- rejected assignment: `REJECTED`, contribution 20, child progress 80
- parent progress: 60, meaning rejected/revision proposals were excluded

### Concurrent Double-Submit Can Leave Weekly Report Draft With Saved Work
Severity: High
Area: Weekly Report

Reproduction steps:
1. Log in as `engineer@dten.com`.
2. Create or open the current weekly report.
3. Add 2 KR-linked priorities, 1 ad-hoc priority, and 2 KR check-ins.
4. Submit twice quickly during concurrent employee submission load.
5. Inspect the current weekly report.

Expected behavior:

The report should end in `SUBMITTED` exactly once, with no duplicate report and no corrupted status.

Actual behavior:

The report retained 3 priorities and 2 check-ins but ended in `DRAFT`. No duplicate current-week report rows were observed, so the duplicate-row guard appears to work, but the status transition was not reliable under double-submit.

Likely root cause:

The submit action or client-side submit handling may not be idempotent across concurrent clicks/submissions, or one stale request may overwrite the status after another request.

Suggested fix location:

`src/app/weekly-report/actions.ts` and the weekly report submit form/client controls.

Related files/APIs:

Weekly report save/submit action, `WeeklyReport.status`

Screenshots/logs if available:

Observed automation result: `engineer@dten.com` status `DRAFT`, priorities `3`, check-ins `2`.

### Employee Can See Edit Controls For CEO-Owned Objective
Severity: Medium
Area: Permissions

Reproduction steps:
1. Log in as a regular employee such as `engineer@dten.com`.
2. Navigate directly to a CEO-owned objective detail page created during the test.
3. Inspect available actions on the page.

Expected behavior:

The employee should not be able to edit CEO-owned objectives. Backend actions must reject unauthorized edits even if a URL is guessed.

Actual behavior:

In a permission probe before the final review-concurrency timeout, the employee could open the objective detail and see an `Edit Objective` control for the CEO-owned objective.

Likely root cause:

The objective detail UI may render edit affordances based on broad authenticated access rather than ownership/admin scope. Backend action authorization still needs direct verification.

Suggested fix location:

`src/app/objectives/[id]/page.tsx`, `src/app/objectives/actions.ts`

Related files/APIs:

Objective detail route and objective update action

Screenshots/logs if available:

No screenshot captured for this probe.

## Data Consistency Results

Report actual observed values:
- active users: 19
- inactive users: 1
- departments: 6
- teams: 9
- weekly reports: 11
- submitted reports: 1
- pending reviews: 1
- reviewed reports: 5
- needs follow-up reports: 5
- check-ins: 19
- notifications: 15,958
- audit logs: 10,784
- objectives: 21
- key results: 23
- child objective assignments: 8
- child objective proposals: 3

Check whether these are correct:
- review routing: PARTIAL. Reports routed to generated managers, but manager review idempotency failure corrupted review/notification/audit counts.
- parent objective roll-up: PASS. Test parent progress was 58 for child progress/contribution values 60/50%, 40/30%, 80/20%.
- KR weighted progress: PASS. Initial test objective calculated 50 from 50/40%, 80/30%, 20/30%. Later employee check-ins changed those KRs to 35/40%, 35/30%, 50/30%, and observed objective progress rounded to 40.
- dashboard numbers: PARTIAL. Dashboards loaded in probes, but final counts were corrupted by duplicate review writes.
- executive summary: PARTIAL. Route loaded in probes, but final data quality was compromised by review duplication.
- export numbers: PARTIAL. CSV export returned valid CSV headers in probes, but final number parity was not reliable after duplicate review writes.

## Permission Test Results

- employee accesses another employee’s weekly report: NOT TESTED in final run because manager review concurrency timed out
- employee accesses CEO dashboard: PARTIAL, route visibility probed but sensitive-data leakage not fully audited
- employee accesses org import: PASS in earlier probe, unauthorized import access was blocked or unavailable
- employee accesses dashboard export: PARTIAL, export response behavior was probed but row-level leakage was not fully verified
- manager reviews a report not assigned to them: NOT TESTED directly; manager queue scoping was not fully verified before review duplication
- manager accesses company-wide export: PARTIAL
- department head accesses another department’s private reports: NOT TESTED
- inactive user logs in or submits weekly report: PASS for login block in earlier probe
- assignee edits another assignee’s child objective proposal: NOT TESTED
- non-parent owner approves a child objective proposal: NOT TESTED
- employee sees edit control on CEO objective: FAIL in earlier probe

## Concurrency / Race Condition Findings

- duplicate submissions: no duplicate current-week report rows were observed, but one double-submit left the report in `DRAFT` with saved priorities/check-ins
- double reviews: FAIL, thousands of duplicate reviews were created for the same two reports
- simultaneous check-ins: PASS for the submitted employee set; check-ins saved and updated KR values
- stale dashboard data: PARTIAL, not conclusively separated from corrupted review data
- session leakage: no direct session leakage observed
- API errors: no app crash observed, but `next-dev.err` included a Postgres client warning about `client.query()` being called while a query was already executing
- server crashes: no server crash, but the automation timed out after 600 seconds due to repeated review submissions

## Recommended Fix Priority

1. Add idempotency and authorization checks to manager review submission; prevent duplicate reviews and stale form submissions.
2. Fix child objective proposal approval so approved proposals enter the expected active child objective lifecycle state.
3. Make weekly report submit idempotent under double-click/concurrent-submit conditions.
4. Audit objective edit permissions in both UI and server actions.
5. Re-run dashboard, executive summary, export, notifications, and audit log tests after review duplication is fixed, because the current duplicate writes distort those features.

## Final Recommendation

The current build needs major fixes before continuing development. CSV import, weighted KR progress, and child objective roll-up are in good shape, but manager review concurrency is a blocker because it can corrupt review, notification, and audit data at high volume. The database should be reset/reseeded before further manual product testing because this run intentionally stressed the system and left duplicate review artifacts behind.
