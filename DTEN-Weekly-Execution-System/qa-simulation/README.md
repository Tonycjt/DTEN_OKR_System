# DTEN OKR QA Simulation

This folder is intentionally separate from the application source. It contains reusable tester artifacts for simulating everyday use of the DTEN OKR Weekly Execution System.

## Files

- `hr-structure-20-users.csv` - realistic 20-user organization import data.
- `daily-usage-simulation.mjs` - Playwright-based smoke workflow runner for CEO import, objective setup, KR creation, and weekly-report usage.

## Run

Start the app first:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run dev
```

Then run:

```powershell
node .\qa-simulation\daily-usage-simulation.mjs
```

The script assumes seeded password `Password123!`.
