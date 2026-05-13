import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, "hr-structure-20-users.csv");
const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:3000";
const password = process.env.QA_PASSWORD ?? "Password123!";

const findings = [];

function logFinding(severity, title, detail) {
  findings.push({ severity, title, detail });
  console.log(`[${severity}] ${title}: ${detail}`);
}

async function login(page, email) {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}

async function logout(page) {
  await page.request.post(`${baseUrl}/api/auth/logout`);
  await page.context().clearCookies();
}

async function importOrgAsCeo(page) {
  await login(page, "ceo@dten.com");
  await page.goto(`${baseUrl}/admin/org-import`);
  await page.getByLabel("CSV / Excel Paste").fill(fs.readFileSync(csvPath, "utf8"));
  await page.getByRole("button", { name: "Validate And Import" }).click();
  await page.getByText("Import complete", { exact: true }).waitFor({ timeout: 20000 });
}

async function createObjective(page, objective) {
  await page.goto(`${baseUrl}/objectives/new`);
  await page.getByLabel("Title").fill(objective.title);
  await page.getByLabel("Description").fill(objective.description);
  await page.getByLabel("Level").selectOption(objective.level);
  await page.getByLabel("Status").selectOption(objective.status);
  await page.getByLabel("Progress Source").selectOption(objective.progressSource);
  await page.getByLabel("Quarter").fill("2026-Q2");
  await page.getByLabel("Progress Percent").fill(String(objective.progressPercent ?? 0));
  await page.getByLabel("Confidence").fill(String(objective.confidence ?? 3));
  await page.getByRole("button", { name: "Save Objective" }).click();
  await page.waitForURL((url) => /\/objectives\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"), { timeout: 15000 });
  return page.url();
}

async function assertSourceSpecificControls(page) {
  const childObjectiveUrl = await createObjective(page, {
    title: `QA Cascaded Objective ${Date.now()}`,
    description: "QA objective used to confirm child-objective source does not expose KR creation.",
    level: "COMPANY",
    status: "DRAFT",
    progressSource: "CHILD_OBJECTIVES",
    progressPercent: 0,
    confidence: 3,
  });

  await page.goto(childObjectiveUrl);
  const addKrVisible = await page.getByRole("heading", { name: "Add Key Result" }).isVisible().catch(() => false);
  if (addKrVisible) {
    logFinding("BUG", "CHILD_OBJECTIVES still exposes Add Key Result", childObjectiveUrl);
  }

  const directKrUrl = await createObjective(page, {
    title: `QA Direct KR Objective ${Date.now()}`,
    description: "QA objective used to confirm direct KR source does not expose child assignment editing.",
    level: "TEAM",
    status: "DRAFT",
    progressSource: "DIRECT_KRS",
    progressPercent: 0,
    confidence: 3,
  });

  await page.goto(directKrUrl);
  const assignmentOwnerVisible = await page.getByLabel("Assignment Owner").isVisible().catch(() => false);
  if (assignmentOwnerVisible) {
    logFinding("BUG", "DIRECT_KRS still exposes child objective assignment creation", directKrUrl);
  }

  return { childObjectiveUrl, directKrUrl };
}

async function addKrToObjective(page, objectiveUrl, ownerName) {
  await page.goto(objectiveUrl);
  const addKrHeading = page.getByRole("heading", { name: "Add Key Result" });
  if (!(await addKrHeading.isVisible().catch(() => false))) {
    logFinding("BUG", "DIRECT_KRS objective did not expose Add Key Result", `${objectiveUrl} did not show the KR creation form.`);
    return;
  }

  await page.getByLabel("Title").last().fill(`QA measurable KR ${Date.now()}`);
  await page.getByLabel("Metric").fill("QA completion percent");
  await page.getByLabel("Owner").last().selectOption({ label: ownerName });
  await page.getByRole("spinbutton", { name: "Start", exact: true }).fill("0");
  await page.getByRole("spinbutton", { name: "Current", exact: true }).fill("10");
  await page.getByRole("spinbutton", { name: "Target", exact: true }).fill("100");
  await page.getByLabel("Status").last().selectOption("ON_TRACK");
  await page.getByLabel("Confidence").last().fill("4");
  await page.getByLabel("Weight Percent").fill("100");
  await page.getByRole("button", { name: "Create KR" }).click();
  await page.waitForLoadState("networkidle");
}

async function addChildObjectiveAssignment(page, parentObjectiveUrl, childObjectiveTitle) {
  await page.goto(parentObjectiveUrl);
  const assignmentOwner = page.getByLabel("Assignment Owner");
  if (!(await assignmentOwner.isVisible().catch(() => false))) {
    logFinding("BUG", "CHILD_OBJECTIVES objective did not expose assignment controls", parentObjectiveUrl);
    return;
  }

  await assignmentOwner.selectOption({ label: "Product Engineering" });
  await page.getByLabel("Linked Child Objective").selectOption({ label: childObjectiveTitle });
  await page.getByLabel("Contribution Percent").fill("100");
  await page.getByRole("button", { name: "Add Assignment" }).click();
  await page.waitForLoadState("networkidle");

  if (!(await page.getByRole("link", { name: childObjectiveTitle }).isVisible().catch(() => false))) {
    logFinding("BUG", "Child objective assignment did not appear after save", `${parentObjectiveUrl} missing ${childObjectiveTitle}`);
  }
}

async function createDirectKrAndWeeklyReport(page, email) {
  await logout(page);
  await login(page, email);
  await page.goto(`${baseUrl}/weekly-report/current`);

  const summaryField = page.getByRole("textbox", { name: "Summary", exact: true });
  if (await summaryField.isDisabled()) {
    logFinding("INFO", "Weekly report is locked for user", `${email} current report fields are disabled.`);
    return;
  }

  await summaryField.fill(`QA weekly summary ${new Date().toISOString()}`);
  await page.getByRole("button", { name: "Save Draft" }).click();
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Priority").first().fill("QA simulate weekly KR execution and surface any blockers.");
  await page.getByLabel("Type").first().selectOption("KR_LINKED").catch(() => {
    logFinding("INFO", "Weekly report form labels changed", "Could not locate first priority type selector by label.");
  });
  const linkedKrOptions = await page.getByLabel("Linked KR").first().locator("option").count();
  if (linkedKrOptions <= 1) {
    logFinding("BUG", "Engineer weekly report has no assigned KRs to link", "The Linked KR dropdown contained only the None option.");
    return;
  }
  await page.getByLabel("Linked KR").first().selectOption({ index: 1 });
  await page.getByLabel("Result Summary").first().fill("Advanced QA scenario coverage for the current KR.");
  await page.getByLabel("Next Step").first().fill("Review manager feedback after submission.");
  await page.getByRole("button", { name: "Add Priority" }).click();
  await page.waitForLoadState("networkidle");

  await page.getByLabel("New Value").first().fill("52");
  await page.getByLabel("KR Status").first().selectOption("AT_RISK");
  await page.getByLabel("Confidence").first().fill("3");
  await page.getByLabel("Check-in Note").first().fill("QA simulation saved a KR-linked check-in.");
  await page.getByRole("button", { name: "Save Check-in" }).click();
  await page.waitForLoadState("networkidle");
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await importOrgAsCeo(page);
    const { childObjectiveUrl, directKrUrl } = await assertSourceSpecificControls(page);
    const cascadeChildTitle = `QA Child Execution Objective ${Date.now()}`;
    const cascadeChildUrl = await createObjective(page, {
      title: cascadeChildTitle,
      description: "QA child objective linked under a cascaded parent.",
      level: "DEPARTMENT",
      status: "DRAFT",
      progressSource: "DIRECT_KRS",
      progressPercent: 0,
      confidence: 3,
    });
    await addChildObjectiveAssignment(page, childObjectiveUrl, cascadeChildTitle);
    await logout(page);
    await login(page, "ceo@dten.com");
    await addKrToObjective(page, cascadeChildUrl, "Chen Liu");
    await createDirectKrAndWeeklyReport(page, "platform-engineer.qa@dten.com");
  } finally {
    await browser.close();
  }

  if (findings.length === 0) {
    console.log("QA simulation completed without recorded findings.");
  } else {
    console.log(JSON.stringify(findings, null, 2));
    process.exitCode = findings.some((finding) => finding.severity === "BUG") ? 1 : 0;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
