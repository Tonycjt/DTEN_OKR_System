# QA Simulation Run Report

Date: 2026-05-13
Branch: testing

## Artifacts Created

- `qa-simulation/hr-structure-20-users.csv`
- `qa-simulation/daily-usage-simulation.mjs`
- `qa-simulation/README.md`

## Workflow Covered

- Logged in as `ceo@dten.com`.
- Imported a realistic 20-person HR structure through `/admin/org-import`.
- Created `CHILD_OBJECTIVES` and `DIRECT_KRS` objectives through the UI.
- Verified `CHILD_OBJECTIVES` objectives do not expose the Add Key Result form.
- Verified `DIRECT_KRS` objectives do not expose child objective assignment creation controls.
- Created a child execution objective.
- Added the child objective as a contribution assignment under a cascaded parent objective.
- Created a KR under a direct-KR objective and assigned it to imported user `platform-engineer.qa@dten.com`.
- Logged in as `platform-engineer.qa@dten.com`.
- Created a KR-linked weekly priority.
- Saved a KR check-in from the weekly report.

## Result

The reusable simulation completed without recorded findings after harness fixes.

## Database Sanity After Run

```text
users: 20
QA objectives: 15
QA key results: 2
QA objective assignments: 1

platform-engineer.qa@dten.com:
- owned KRs: 2
- weekly reports: 1
- weekly priorities: 2
- weekly report check-ins: 1
```

## Notes

- Failed harness attempts created extra `QA ...` objectives before the final successful run. These are test artifacts, not app source changes.
- App source was not modified by this tester pass.
