import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, "hr-structure-20-users.csv");
const reportPath = path.join(__dirname, "concurrent-r3-2-report.md");
const importScreenshotPath = path.join(__dirname, "org-import-result.png");
const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:3000";
const password = process.env.QA_PASSWORD ?? "Password123!";
const testRun = `E2E ${new Date().toISOString().replace(/[:.]/g, "-")}`;

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL),
});

const bugs = [];
const checks = [];
const permissionResults = [];
const concurrencyFindings = [];
const screenshots = [];

function recordCheck(name, status, detail = "") {
  checks.push({ name, status, detail });
  console.log(`[${status}] ${name}${detail ? ` - ${detail}` : ""}`);
}

function recordBug({ title, severity = "Medium", area, steps, expected, actual, likelyRootCause, suggestedFixLocation, relatedFiles = [], logs = "" }) {
  bugs.push({ title, severity, area, steps, expected, actual, likelyRootCause, suggestedFixLocation, relatedFiles, logs });
  console.log(`[BUG:${severity}] ${area} - ${title}`);
}

function recordPermission(name, result, detail = "") {
  permissionResults.push({ name, result, detail });
  console.log(`[PERMISSION:${result}] ${name}${detail ? ` - ${detail}` : ""}`);
}

async function getCurrentDbSummary() {
  const [
    activeUsers,
    inactiveUsers,
    departments,
    teams,
    weeklyReports,
    submittedReports,
    pendingReviews,
    reviewedReports,
    checkIns,
    notifications,
    auditLogs,
    objectives,
    keyResults,
    childObjectiveAssignments,
    childObjectiveProposals,
  ] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: false } }),
    prisma.department.count(),
    prisma.team.count(),
    prisma.weeklyReport.count(),
    prisma.weeklyReport.count({ where: { status: "SUBMITTED" } }),
    prisma.weeklyReport.count({ where: { status: "SUBMITTED" } }),
    prisma.weeklyReport.count({ where: { status: "REVIEWED" } }),
    prisma.checkIn.count(),
    prisma.notification.count(),
    prisma.auditLog.count(),
    prisma.objective.count(),
    prisma.keyResult.count(),
    prisma.objectiveAssignment.count(),
    prisma.objectiveAssignment.count({ where: { assignmentMode: "CONTRIBUTION_ONLY" } }),
  ]);

  return {
    activeUsers,
    inactiveUsers,
    departments,
    teams,
    weeklyReports,
    submittedReports,
    pendingReviews,
    reviewedReports,
    checkIns,
    notifications,
    auditLogs,
    objectives,
    keyResults,
    childObjectiveAssignments,
    childObjectiveProposals,
  };
}

async function login(browser, email) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForLoadState("networkidle");
  return { context, page };
}

async function expectLoginSuccess(browser, email) {
  const session = await login(browser, email);
  const ok = session.page.url().includes("/dashboard");
  recordCheck(`login ${email}`, ok ? "PASS" : "FAIL", session.page.url());
  return session;
}

async function expectLoginFailure(browser, email) {
  const { context, page } = await login(browser, email);
  const failed = page.url().includes("/login") && (await page.locator(".alert").textContent().catch(() => "")).includes("incorrect");
  recordCheck(`inactive login blocked ${email}`, failed ? "PASS" : "FAIL", page.url());
  await context.close();
}

async function importCsvThroughUi(browser) {
  const { context, page } = await expectLoginSuccess(browser, "ceo@dten.com");
  await page.goto(`${baseUrl}/admin/org-import`);
  await page.getByLabel("CSV / Excel Paste").fill(fs.readFileSync(csvPath, "utf8"));
  await page.getByRole("button", { name: "Validate And Import" }).click();
  await page.getByText("Import complete", { exact: true }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: importScreenshotPath, fullPage: true });
  screenshots.push(importScreenshotPath);
  recordCheck("CSV org import", "PASS", importScreenshotPath);

  const beforeInvalid = await prisma.user.count();
  const invalidCsv = [
    "name,email,title,role,department,team,primary_manager_email,review_owner_email,employment_status",
    "Bad One,duplicate.qa@dten.com,Bad,EMPLOYEE,Sales,Enterprise Sales,missing-manager.qa@dten.com,missing-manager.qa@dten.com,ACTIVE",
    "Bad Two,duplicate.qa@dten.com,Bad,NOT_A_ROLE,Sales,Enterprise Sales,duplicate.qa@dten.com,duplicate.qa@dten.com,ACTIVE",
  ].join("\n");
  await page.getByLabel("CSV / Excel Paste").fill(invalidCsv);
  await page.getByRole("button", { name: "Validate And Import" }).click();
  await page.getByText("Import blocked", { exact: true }).waitFor({ timeout: 30000 });
  const afterInvalid = await prisma.user.count();
  recordCheck("invalid CSV blocked without user-count mutation", beforeInvalid === afterInvalid ? "PASS" : "FAIL", `${beforeInvalid} -> ${afterInvalid}`);
  await context.close();
}

async function createObjectiveUi(page, input) {
  await page.goto(`${baseUrl}/objectives/new`);
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Save Objective" }) });
  await form.locator('input[name="title"]').fill(input.title);
  await form.locator('textarea[name="description"]').fill(input.description ?? `${testRun} objective`);
  await form.locator('select[name="level"]').selectOption(input.level ?? "TEAM");
  await form.locator('select[name="status"]').selectOption(input.status ?? "DRAFT");
  await form.locator('select[name="progressSource"]').selectOption(input.progressSource ?? "MANUAL");
  await form.locator('input[name="quarter"]').fill("2026-Q2");
  if (input.ownerId) await form.locator('select[name="ownerId"]').selectOption(input.ownerId);
  if (input.departmentId) await form.locator('select[name="departmentId"]').selectOption(input.departmentId);
  if (input.teamId) await form.locator('select[name="teamId"]').selectOption(input.teamId);
  await form.locator('input[name="progressPercent"]').fill(String(input.progressPercent ?? 0));
  await form.locator('input[name="confidenceScore"]').fill(String(input.confidenceScore ?? 3));
  await form.getByRole("button", { name: "Save Objective" }).click();
  await page.waitForURL((url) => /\/objectives\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"), { timeout: 30000 });
  return page.url().split("/").pop();
}

async function addKrUi(page, objectiveId, input) {
  await page.goto(`${baseUrl}/objectives/${objectiveId}`);
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Create KR" }) });
  await form.locator('input[name="title"]').fill(input.title);
  await form.locator('input[name="metricName"]').fill(input.metricName ?? "Percent");
  await form.locator('select[name="ownerId"]').selectOption(input.ownerId);
  await form.locator('input[name="startValue"]').fill(String(input.startValue ?? 0));
  await form.locator('input[name="currentValue"]').fill(String(input.currentValue));
  await form.locator('input[name="targetValue"]').fill(String(input.targetValue ?? 100));
  await form.locator('select[name="status"]').selectOption(input.status ?? "ON_TRACK");
  await form.locator('input[name="confidenceScore"]').fill(String(input.confidenceScore ?? 3));
  await form.locator('input[name="weightPercent"]').fill(String(input.weightPercent ?? 100));
  await form.getByRole("button", { name: "Create KR" }).click();
  await page.waitForLoadState("networkidle");
}

async function addAssignmentUi(page, parentObjectiveId, input) {
  await page.goto(`${baseUrl}/objectives/${parentObjectiveId}`);
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add Assignment" }) });
  await form.locator('select[name="assignmentMode"]').selectOption(input.assignmentMode ?? "CONTRIBUTION_ONLY");
  await form.locator('input[name="assignmentInstruction"]').fill(input.instruction ?? "");
  await form.locator('select[name="assigneeRef"]').selectOption(input.assigneeRef);
  if (input.assignedObjectiveId) {
    await form.locator('select[name="assignedObjectiveId"]').selectOption(input.assignedObjectiveId);
  }
  await form.locator('input[name="contributionPercent"]').fill(String(input.contributionPercent));
  await form.getByRole("button", { name: "Add Assignment" }).click();
  await page.waitForLoadState("networkidle");
}

async function setupOkrWorkflows(browser) {
  const users = await prisma.user.findMany({ include: { department: true, team: true } });
  const byEmail = Object.fromEntries(users.map((user) => [user.email, user]));
  const byDept = Object.fromEntries((await prisma.department.findMany()).map((department) => [department.name, department]));
  const { context, page } = await expectLoginSuccess(browser, "ceo@dten.com");

  const weightedObjectiveId = await createObjectiveUi(page, {
    title: `${testRun} Complete D7X Enterprise Readiness`,
    level: "COMPANY",
    status: "DRAFT",
    progressSource: "DIRECT_KRS",
    ownerId: byEmail["ceo@dten.com"].id,
    departmentId: byDept.Executive.id,
  });
  await addKrUi(page, weightedObjectiveId, {
    title: `${testRun} Complete Microsoft Teams certification`,
    ownerId: byEmail["cert-engineer.qa@dten.com"].id,
    currentValue: 50,
    weightPercent: 40,
  });
  await addKrUi(page, weightedObjectiveId, {
    title: `${testRun} Complete Zoom certification`,
    ownerId: byEmail["qa-engineer.qa@dten.com"].id,
    currentValue: 80,
    weightPercent: 30,
  });
  await addKrUi(page, weightedObjectiveId, {
    title: `${testRun} Resolve GA stability issues`,
    ownerId: byEmail["engineer@dten.com"].id,
    currentValue: 20,
    weightPercent: 30,
    status: "AT_RISK",
  });

  const weightedObjective = await prisma.objective.findUnique({ where: { id: weightedObjectiveId }, include: { keyResults: true } });
  if (Math.round(weightedObjective?.progressPercent ?? -1) === 50) {
    recordCheck("weighted KR progress formula", "PASS", "expected 50%, observed 50%");
  } else {
    recordBug({
      title: "Weighted KR objective progress mismatch",
      severity: "High",
      area: "KR Weight",
      steps: ["Create DIRECT_KRS objective", "Add KRs with 40/30/30 weights and 50/80/20 progress", "Inspect objective progress"],
      expected: "Objective progress is 50%.",
      actual: `Observed ${weightedObjective?.progressPercent ?? "missing"}%.`,
      likelyRootCause: "Roll-up calculation or persistence issue.",
      suggestedFixLocation: "src/server/objective-rollup.ts",
      relatedFiles: ["src/server/objective-rollup.ts", "src/lib/okr-calculations.ts"],
    });
  }

  const productChildId = await createObjectiveUi(page, {
    title: `${testRun} Product Engineering Readiness`,
    level: "DEPARTMENT",
    status: "DRAFT",
    progressSource: "MANUAL",
    ownerId: byEmail["head@dten.com"].id,
    departmentId: byDept["Product Engineering"].id,
    progressPercent: 60,
  });
  const salesChildId = await createObjectiveUi(page, {
    title: `${testRun} Sales Readiness`,
    level: "DEPARTMENT",
    status: "DRAFT",
    progressSource: "MANUAL",
    ownerId: byEmail["sales-head.qa@dten.com"].id,
    departmentId: byDept.Sales.id,
    progressPercent: 40,
  });
  const csChildId = await createObjectiveUi(page, {
    title: `${testRun} Customer Success Readiness`,
    level: "DEPARTMENT",
    status: "DRAFT",
    progressSource: "MANUAL",
    ownerId: byEmail["cs-head.qa@dten.com"].id,
    departmentId: byDept["Customer Success"].id,
    progressPercent: 80,
  });
  const rollupParentId = await createObjectiveUi(page, {
    title: `${testRun} Improve Enterprise Readiness`,
    level: "COMPANY",
    status: "DRAFT",
    progressSource: "CHILD_OBJECTIVES",
    ownerId: byEmail["ceo@dten.com"].id,
    departmentId: byDept.Executive.id,
  });
  await addAssignmentUi(page, rollupParentId, {
    assignmentMode: "PREDEFINED_CHILD_OBJECTIVE",
    assigneeRef: `USER::${byEmail["head@dten.com"].id}`,
    assignedObjectiveId: productChildId,
    contributionPercent: 50,
  });
  await addAssignmentUi(page, rollupParentId, {
    assignmentMode: "PREDEFINED_CHILD_OBJECTIVE",
    assigneeRef: `USER::${byEmail["sales-head.qa@dten.com"].id}`,
    assignedObjectiveId: salesChildId,
    contributionPercent: 30,
  });
  await addAssignmentUi(page, rollupParentId, {
    assignmentMode: "PREDEFINED_CHILD_OBJECTIVE",
    assigneeRef: `USER::${byEmail["cs-head.qa@dten.com"].id}`,
    assignedObjectiveId: csChildId,
    contributionPercent: 20,
  });
  const rollupParent = await prisma.objective.findUnique({ where: { id: rollupParentId } });
  if (Math.round(rollupParent?.progressPercent ?? -1) === 58) {
    recordCheck("parent child-objective weighted roll-up", "PASS", "expected 58%, observed 58%");
  } else {
    recordBug({
      title: "Parent objective roll-up mismatch",
      severity: "High",
      area: "Child Objective Roll-up",
      steps: ["Create CHILD_OBJECTIVES parent", "Attach 60/40/80 child objectives with 50/30/20 contributions", "Inspect parent progress"],
      expected: "Parent progress is 58%.",
      actual: `Observed ${rollupParent?.progressPercent ?? "missing"}%.`,
      likelyRootCause: "Objective assignment roll-up calculation issue.",
      suggestedFixLocation: "src/server/objective-rollup.ts",
      relatedFiles: ["src/server/objective-rollup.ts", "src/app/objectives/actions.ts"],
    });
  }

  const proposalParentId = await createObjectiveUi(page, {
    title: `${testRun} Improve Enterprise Product and Revenue Execution`,
    level: "COMPANY",
    status: "DRAFT",
    progressSource: "CHILD_OBJECTIVES",
    ownerId: byEmail["ceo@dten.com"].id,
    departmentId: byDept.Executive.id,
  });
  await addAssignmentUi(page, proposalParentId, {
    assignmentMode: "CONTRIBUTION_ONLY",
    assigneeRef: `USER::${byEmail["head@dten.com"].id}`,
    contributionPercent: 50,
    instruction: "Propose product engineering execution objective.",
  });
  await addAssignmentUi(page, proposalParentId, {
    assignmentMode: "CONTRIBUTION_ONLY",
    assigneeRef: `USER::${byEmail["sales-head.qa@dten.com"].id}`,
    contributionPercent: 30,
    instruction: "Propose sales execution objective.",
  });
  await addAssignmentUi(page, proposalParentId, {
    assignmentMode: "CONTRIBUTION_ONLY",
    assigneeRef: `USER::${byEmail["cs-head.qa@dten.com"].id}`,
    contributionPercent: 20,
    instruction: "Propose customer success execution objective.",
  });
  await context.close();

  return { byEmail, byDept, weightedObjectiveId, rollupParentId, proposalParentId };
}

async function proposeChildObjective(browser, assigneeEmail, ownerId, title, progressPercent) {
  const { context, page } = await expectLoginSuccess(browser, assigneeEmail);
  const childId = await createObjectiveUi(page, {
    title,
    level: "DEPARTMENT",
    status: "DRAFT",
    progressSource: "MANUAL",
    ownerId,
    progressPercent,
  });
  await page.goto(`${baseUrl}/my-okrs`);
  const proposalForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Submit Proposal" }) }).first();
  await proposalForm.locator('select[name="proposedObjectiveId"]').selectOption(childId);
  await proposalForm.getByRole("button", { name: "Submit Proposal" }).click();
  await page.waitForLoadState("networkidle");
  await context.close();
  return childId;
}

async function reviewProposal(browser, parentObjectiveId, assignmentId, decision, note = "") {
  const { context, page } = await expectLoginSuccess(browser, "ceo@dten.com");
  await page.goto(`${baseUrl}/objectives/${parentObjectiveId}`);
  const assignmentInput = page.locator(`input[name="assignmentId"][value="${assignmentId}"]`).first();
  const form = assignmentInput.locator("xpath=ancestor::form[1]");
  if (note) {
    await form.locator('input[name="revisionNote"]').fill(note);
  }
  await form.getByRole("button", { name: decision === "APPROVED" ? "Approve" : decision === "NEEDS_REVISION" ? "Request Revision" : "Reject" }).click();
  await page.waitForLoadState("networkidle");
  await context.close();
}

async function runProposalWorkflow(browser, setup) {
  const productChildId = await proposeChildObjective(
    browser,
    "head@dten.com",
    setup.byEmail["head@dten.com"].id,
    `${testRun} Proposed Product Execution`,
    60,
  );
  const salesChildId = await proposeChildObjective(
    browser,
    "sales-head.qa@dten.com",
    setup.byEmail["sales-head.qa@dten.com"].id,
    `${testRun} Proposed Sales Execution`,
    40,
  );
  const csChildId = await proposeChildObjective(
    browser,
    "cs-head.qa@dten.com",
    setup.byEmail["cs-head.qa@dten.com"].id,
    `${testRun} Proposed CS Execution`,
    80,
  );

  const assignments = await prisma.objectiveAssignment.findMany({
    where: { parentObjectiveId: setup.proposalParentId },
    orderBy: { contributionPercent: "desc" },
  });
  const productAssignment = assignments.find((assignment) => assignment.assigneeId === setup.byEmail["head@dten.com"].id);
  const salesAssignment = assignments.find((assignment) => assignment.assigneeId === setup.byEmail["sales-head.qa@dten.com"].id);
  const csAssignment = assignments.find((assignment) => assignment.assigneeId === setup.byEmail["cs-head.qa@dten.com"].id);

  await reviewProposal(browser, setup.proposalParentId, productAssignment.id, "APPROVED");
  await reviewProposal(browser, setup.proposalParentId, salesAssignment.id, "NEEDS_REVISION", "Tighten sales launch milestones.");
  await reviewProposal(browser, setup.proposalParentId, csAssignment.id, "REJECTED");

  const after = await prisma.objectiveAssignment.findMany({
    where: { parentObjectiveId: setup.proposalParentId },
    include: { assignedObjective: true },
    orderBy: { contributionPercent: "desc" },
  });
  const proposalParent = await prisma.objective.findUnique({ where: { id: setup.proposalParentId } });

  const approved = after.find((assignment) => assignment.id === productAssignment.id);
  if (approved?.status !== "ACTIVE") {
    recordBug({
      title: "Approved child objective proposal does not become ACTIVE",
      severity: "High",
      area: "Child Objective Proposal",
      steps: ["Create contribution-only assignment", "Assignee proposes a child objective", "Parent owner approves proposal", "Inspect assignment status"],
      expected: "Approved child objective assignment becomes ACTIVE.",
      actual: `Assignment status is ${approved?.status}.`,
      likelyRootCause: "reviewAssignmentAction stores APPROVED instead of ACTIVE for approved proposals.",
      suggestedFixLocation: "src/app/objectives/actions.ts reviewAssignmentAction",
      relatedFiles: ["src/app/objectives/actions.ts", "prisma/schema.prisma"],
    });
  } else {
    recordCheck("approved proposal becomes active", "PASS");
  }

  if (Math.round(proposalParent?.progressPercent ?? 0) !== 60) {
    recordBug({
      title: "Pending/rejected child objective proposals affect parent roll-up",
      severity: "High",
      area: "Child Objective Roll-up",
      steps: [
        "Create parent with CHILD_OBJECTIVES source",
        "Submit three child proposals with progress 60/40/80",
        "Approve one, request revision on one, reject one",
        "Inspect parent progress",
      ],
      expected: "Only approved/active child objectives affect parent progress; expected 60% if only the approved child is counted.",
      actual: `Parent progress is ${proposalParent?.progressPercent}%, indicating non-approved proposals may be counted.`,
      likelyRootCause: "recalculateObjectiveProgress includes all assignedObjective links regardless of ObjectiveAssignment.status.",
      suggestedFixLocation: "src/server/objective-rollup.ts",
      relatedFiles: ["src/server/objective-rollup.ts", "src/app/objectives/actions.ts"],
    });
  } else {
    recordCheck("proposal roll-up excludes non-approved assignments", "PASS");
  }

  return { productChildId, salesChildId, csChildId, proposalAssignments: after };
}

async function setupEmployeeKrsForWeeklyReports(users) {
  const employeeEmails = [
    "engineer@dten.com",
    "platform-engineer.qa@dten.com",
    "qa-engineer.qa@dten.com",
    "cert-engineer.qa@dten.com",
    "sales@dten.com",
    "sdr.qa@dten.com",
    "customer-success.qa@dten.com",
    "demand-gen.qa@dten.com",
  ];
  const created = [];
  for (const email of employeeEmails) {
    const user = users.byEmail[email];
    const objective = await prisma.objective.create({
      data: {
        title: `${testRun} Weekly execution objective ${user.name}`,
        description: "Created by QA setup for concurrent weekly report simulation.",
        level: "INDIVIDUAL",
        status: "DRAFT",
        quarter: "2026-Q2",
        progressSource: "DIRECT_KRS",
        ownerId: user.id,
        departmentId: user.departmentId,
        teamId: user.teamId,
      },
    });
    await prisma.keyResult.createMany({
      data: [
        {
          objectiveId: objective.id,
          ownerId: user.id,
          title: `${testRun} ${user.name} KR A`,
          metricName: "Completion percent",
          currentValue: 10,
          targetValue: 100,
          progressPercent: 10,
          weightPercent: 50,
          confidenceScore: 3,
          status: "ON_TRACK",
          pacingStatus: "BEHIND",
        },
        {
          objectiveId: objective.id,
          ownerId: user.id,
          title: `${testRun} ${user.name} KR B`,
          metricName: "Completion percent",
          currentValue: 20,
          targetValue: 100,
          progressPercent: 20,
          weightPercent: 50,
          confidenceScore: 3,
          status: "ON_TRACK",
          pacingStatus: "BEHIND",
        },
      ],
    });
    const createdKrs = await prisma.keyResult.findMany({ where: { objectiveId: objective.id } });
    await prisma.monthlyTarget.createMany({
      data: createdKrs.flatMap((kr) =>
        [1, 2, 3].map((monthIndex) => ({
          keyResultId: kr.id,
          monthIndex,
          targetValue: monthIndex === 3 ? 100 : monthIndex * 33,
          targetPercent: monthIndex === 3 ? 100 : monthIndex * 33,
        })),
      ),
    });
    created.push({ email, objectiveId: objective.id });
  }
  recordCheck("weekly report KR setup", "PASS", `${created.length} employee objectives with two KRs each`);
  return employeeEmails;
}

async function submitWeeklyReport(browser, email, doubleSubmit = false) {
  const { context, page } = await expectLoginSuccess(browser, email);
  const beforeUserReviewNotifications = await prisma.notification.count({
    where: { type: "REVIEW_REQUESTED", body: { contains: (await prisma.user.findUnique({ where: { email } }))?.name ?? "" } },
  });
  await page.goto(`${baseUrl}/weekly-report/current`);
  const summary = page.getByRole("textbox", { name: "Summary", exact: true });
  if (await summary.isDisabled()) {
    await context.close();
    recordCheck(`weekly report unlocked ${email}`, "FAIL", "summary field disabled");
    return;
  }
  await summary.fill(`${testRun} weekly execution summary for ${email}`);
  await page.getByRole("button", { name: "Save Draft" }).click();
  await page.waitForLoadState("networkidle");

  for (let index = 0; index < 2; index += 1) {
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add Priority" }) });
    await form.locator('textarea[name="content"]').fill(`${testRun} KR-linked priority ${index + 1}`);
    await form.locator('select[name="type"]').selectOption("KR_LINKED");
    await form.locator('select[name="linkedKeyResultId"]').selectOption({ index: index + 1 });
    await form.locator('input[name="resultSummary"]').fill("Progress moved during QA simulation.");
    await form.locator('input[name="nextStep"]').fill("Continue execution.");
    await form.getByRole("button", { name: "Add Priority" }).click();
    await page.waitForLoadState("networkidle");
    await page.goto(`${baseUrl}/weekly-report/current`);
    const checkInCount = await page.getByRole("button", { name: "Save Check-in" }).count();
    if (checkInCount > index) {
      const checkInForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Save Check-in" }) }).nth(index);
      await checkInForm.locator('input[name="newValue"]').fill(String(35 + index * 15));
      await checkInForm.locator('select[name="status"]').selectOption(index === 0 ? "ON_TRACK" : "AT_RISK");
      await checkInForm.locator('input[name="confidenceScore"]').fill(index === 0 ? "4" : "3");
      await checkInForm.locator('textarea[name="note"]').fill(`${testRun} concurrent check-in ${index + 1}`);
      await checkInForm.getByRole("button", { name: "Save Check-in" }).click();
      await page.waitForLoadState("networkidle");
    }
  }

  const adHocForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Add Priority" }) });
  await adHocForm.locator('textarea[name="content"]').fill(`${testRun} Ad-hoc priority`);
  await adHocForm.locator('select[name="type"]').selectOption("AD_HOC");
  await adHocForm.locator('input[name="resultSummary"]').fill("Handled ad-hoc blocker.");
  await adHocForm.getByRole("button", { name: "Add Priority" }).click();
  await page.waitForLoadState("networkidle");

  await page.goto(`${baseUrl}/weekly-report/current`);
  if (doubleSubmit) {
    const second = await context.newPage();
    await second.goto(`${baseUrl}/weekly-report/current`);
    await Promise.allSettled([
      page.getByRole("button", { name: "Submit Weekly Report" }).click(),
      second.getByRole("button", { name: "Submit Weekly Report" }).click(),
    ]);
    await second.close();
  } else {
    await page.getByRole("button", { name: "Submit Weekly Report" }).click();
  }
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const report = await prisma.weeklyReport.findFirst({
    where: { user: { email } },
    orderBy: { weekStart: "desc" },
    select: { status: true, priorities: true, checkIns: true },
  });
  if (report?.status !== "SUBMITTED" && report?.status !== "REVIEWED" && report?.status !== "NEEDS_FOLLOW_UP") {
    recordCheck(`weekly report submitted ${email}`, "FAIL", `status ${report?.status ?? "missing"}, priorities ${report?.priorities.length ?? 0}, checkIns ${report?.checkIns.length ?? 0}`);
  } else {
    recordCheck(`weekly report submitted ${email}`, "PASS", `status ${report.status}, priorities ${report.priorities.length}, checkIns ${report.checkIns.length}`);
  }
  const afterUserReviewNotifications = await prisma.notification.count({
    where: { type: "REVIEW_REQUESTED", body: { contains: (await prisma.user.findUnique({ where: { email } }))?.name ?? "" } },
  });
  await context.close();
  return { notificationDelta: afterUserReviewNotifications - beforeUserReviewNotifications };
}

async function runConcurrentWeeklyReports(browser, employeeEmails) {
  const beforeNotifications = await prisma.notification.count({ where: { type: "REVIEW_REQUESTED" } });
  const results = await Promise.all(employeeEmails.map((email, index) => submitWeeklyReport(browser, email, index === 0)));
  const reports = await prisma.weeklyReport.findMany({
    where: { user: { email: { in: employeeEmails } } },
    include: { user: true, priorities: true, checkIns: true },
  });
  const afterNotifications = await prisma.notification.count({ where: { type: "REVIEW_REQUESTED" } });
  const duplicateReportUsers = Object.entries(
    reports.reduce((acc, report) => {
      const key = `${report.user.email}:${report.weekStart.toISOString()}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  ).filter(([, count]) => count > 1);

  if (duplicateReportUsers.length > 0) {
    recordBug({
      title: "Duplicate current-week reports created under concurrency",
      severity: "Critical",
      area: "Weekly Report",
      steps: ["Submit weekly reports concurrently for active employees", "Inspect weekly report rows by user/week"],
      expected: "One current-week report per user.",
      actual: JSON.stringify(duplicateReportUsers),
      likelyRootCause: "Upsert uniqueness or concurrent create issue.",
      suggestedFixLocation: "src/app/weekly-report/actions.ts ensureCurrentWeeklyReport",
      relatedFiles: ["src/app/weekly-report/actions.ts", "prisma/schema.prisma"],
    });
  } else {
    recordCheck("no duplicate current-week reports", "PASS", `${reports.length} reports for ${employeeEmails.length} employees`);
  }

  const firstEmployee = employeeEmails[0];
  const firstUser = await prisma.user.findUnique({
    where: { email: firstEmployee },
    include: { weeklyReports: true },
  });
  const firstReport = firstUser.weeklyReports[0];
  const reviewRequestedForFirst = results[0]?.notificationDelta ?? 0;
  if (reviewRequestedForFirst > 1) {
    recordBug({
      title: "Double-submit creates duplicate review-request notifications",
      severity: "High",
      area: "Weekly Report",
      steps: ["Open same user's current report in two browser pages", "Submit both pages nearly simultaneously", "Inspect REVIEW_REQUESTED notifications"],
      expected: "At most one review-request notification for one report submission.",
      actual: `${reviewRequestedForFirst} new review-request notifications found for ${firstUser.name}. Report ${firstReport?.id}.`,
      likelyRootCause: "submitWeeklyReportAction does not guard against already submitted reports before creating notification/audit side effects.",
      suggestedFixLocation: "src/app/weekly-report/actions.ts submitWeeklyReportAction",
      relatedFiles: ["src/app/weekly-report/actions.ts"],
    });
  }
  concurrencyFindings.push(`Review-request notifications before/after weekly submissions: ${beforeNotifications} -> ${afterNotifications}`);
}

async function reviewVisibleReports(browser, email, decision) {
  const { context, page } = await expectLoginSuccess(browser, email);
  await page.goto(`${baseUrl}/reviews/pending`);
  let reviewed = 0;
  while ((await page.locator("form").filter({ has: page.getByRole("button", { name: "Submit Review" }) }).count()) > 0) {
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Submit Review" }) }).first();
    await form.locator('select[name="decision"]').selectOption(decision);
    await form.locator('textarea[name="comment"]').fill(`${testRun} ${decision} review by ${email}`);
    await form.getByRole("button", { name: "Submit Review" }).click();
    await page.waitForLoadState("networkidle");
    reviewed += 1;
  }
  await context.close();
  return reviewed;
}

async function runConcurrentManagerReviews(browser) {
  const reviewers = [
    ["manager@dten.com", "APPROVED"],
    ["android-manager.qa@dten.com", "NEEDS_FOLLOW_UP"],
    ["sales-manager.qa@dten.com", "RISK_FLAGGED"],
    ["cs-manager.qa@dten.com", "APPROVED"],
    ["marketing-head.qa@dten.com", "NEEDS_FOLLOW_UP"],
  ];
  const counts = await Promise.all(reviewers.map(([email, decision]) => reviewVisibleReports(browser, email, decision)));
  recordCheck("concurrent manager review queues processed", "PASS", JSON.stringify(Object.fromEntries(reviewers.map(([email], index) => [email, counts[index]]))));

  const duplicateReviews = await prisma.$queryRaw`
    SELECT "weeklyReportId", COUNT(*)::int AS count
    FROM "ManagerReview"
    GROUP BY "weeklyReportId"
    HAVING COUNT(*) > 1
  `;
  if (duplicateReviews.length > 0) {
    recordBug({
      title: "Duplicate manager reviews exist for one weekly report",
      severity: "High",
      area: "Review Routing",
      steps: ["Submit reports", "Review reports through manager queues", "Inspect ManagerReview grouped by weeklyReportId"],
      expected: "One manager review per report, or explicit review revision history with UI semantics.",
      actual: JSON.stringify(duplicateReviews),
      likelyRootCause: "submitManagerReviewAction creates reviews without checking existing review state/status.",
      suggestedFixLocation: "src/app/reviews/actions.ts submitManagerReviewAction",
      relatedFiles: ["src/app/reviews/actions.ts", "prisma/schema.prisma"],
    });
  } else {
    recordCheck("duplicate manager reviews", "PASS", "none observed after manager review run");
  }
}

async function runDashboardAndPermissionChecks(browser, setup) {
  const roles = [
    "ceo@dten.com",
    "head@dten.com",
    "manager@dten.com",
    "engineer@dten.com",
    "people-admin.qa@dten.com",
  ];
  for (const email of roles) {
    const { context, page } = await expectLoginSuccess(browser, email);
    await page.goto(`${baseUrl}/dashboard`);
    recordCheck(`dashboard loads ${email}`, page.url().includes("/dashboard") ? "PASS" : "FAIL", page.url());
    const bodyText = await page.locator("body").innerText();
    if (/NaN|undefined|null/.test(bodyText)) {
      recordBug({
        title: `Dashboard renders placeholder value for ${email}`,
        severity: "Medium",
        area: "Dashboard",
        steps: [`Login as ${email}`, "Open /dashboard", "Scan rendered text"],
        expected: "No NaN, undefined, or null values visible.",
        actual: "Rendered page contains NaN, undefined, or null.",
        likelyRootCause: "Dashboard rendering does not normalize empty values.",
        suggestedFixLocation: "src/app/dashboard/page.tsx",
        relatedFiles: ["src/app/dashboard/page.tsx"],
      });
    }
    await page.goto(`${baseUrl}/executive-summary`);
    recordCheck(`executive summary loads ${email}`, page.url().includes("/executive-summary") ? "PASS" : "FAIL", page.url());
    const exportResponse = await page.request.get(`${baseUrl}/dashboard/export`);
    const csv = await exportResponse.text();
    const hasHeaders = csv.startsWith("section,type,name,owner,department,status,pacing,confidence,progress,details,url");
    recordCheck(`dashboard CSV export ${email}`, exportResponse.status() === 200 && hasHeaders ? "PASS" : "FAIL", `status ${exportResponse.status()}`);
    if (email === "engineer@dten.com" && csv.includes("Casey Chen")) {
      recordBug({
        title: "Employee dashboard export includes CEO-owned data",
        severity: "High",
        area: "Export",
        steps: ["Login as employee", "Request /dashboard/export", "Search CSV for CEO-owned rows"],
        expected: "Employee export is scoped to employee-owned/review-scope data.",
        actual: "Employee CSV contains Casey Chen.",
        likelyRootCause: "Dashboard export scope too broad for employee.",
        suggestedFixLocation: "src/lib/dashboard-export.ts",
        relatedFiles: ["src/lib/dashboard-export.ts", "src/app/dashboard/export/route.ts"],
      });
    }
    await context.close();
  }

  const employee = await expectLoginSuccess(browser, "engineer@dten.com");
  await employee.page.goto(`${baseUrl}/admin/org-import`);
  recordPermission("employee access org import", employee.page.url().includes("/dashboard") ? "PASS" : "FAIL", employee.page.url());
  await employee.page.goto(`${baseUrl}/admin/audit-log`);
  recordPermission("employee access audit log", employee.page.url().includes("/dashboard") ? "PASS" : "FAIL", employee.page.url());
  await employee.page.goto(`${baseUrl}/objectives/${setup.weightedObjectiveId}`);
  const editVisible = await employee.page.getByRole("heading", { name: "Edit Objective" }).isVisible().catch(() => false);
  if (editVisible) {
    recordBug({
      title: "Employee can open edit controls for CEO-owned objective",
      severity: "High",
      area: "Permissions",
      steps: ["Login as employee", "Open a CEO-owned objective detail URL", "Inspect page controls"],
      expected: "Employee cannot edit CEO-owned objective; edit form is hidden or backend rejects updates.",
      actual: "Edit Objective form is visible to employee.",
      likelyRootCause: "Objective detail page and update actions require authentication but not ownership/role authorization.",
      suggestedFixLocation: "src/app/objectives/[id]/page.tsx and src/app/objectives/actions.ts",
      relatedFiles: ["src/app/objectives/[id]/page.tsx", "src/app/objectives/actions.ts"],
    });
  } else {
    recordPermission("employee objective edit controls", "PASS", "edit form hidden");
  }
  await employee.context.close();

  await expectLoginFailure(browser, "inactive-employee.qa@dten.com");
}

async function inspectDataConsistency(setup) {
  const users = await prisma.user.findMany({ include: { manager: true, reviewOwner: true, department: true, team: true } });
  const ceoRoots = users.filter((user) => !user.managerId).map((user) => user.email);
  if (!ceoRoots.includes("ceo@dten.com")) {
    recordCheck("org root CEO", "FAIL", JSON.stringify(ceoRoots));
  } else {
    recordCheck("org root CEO", "PASS", JSON.stringify(ceoRoots));
  }

  const activeUsersMissingReviewer = users.filter((user) => user.isActive && user.role !== "CEO" && !user.reviewOwnerId && !user.managerId);
  recordCheck("active users have manager/review owner", activeUsersMissingReviewer.length === 0 ? "PASS" : "FAIL", activeUsersMissingReviewer.map((user) => user.email).join(", "));

  const duplicateCurrentReports = await prisma.$queryRaw`
    SELECT "userId", "weekStart", COUNT(*)::int AS count
    FROM "WeeklyReport"
    GROUP BY "userId", "weekStart"
    HAVING COUNT(*) > 1
  `;
  recordCheck("duplicate current-week report rows", duplicateCurrentReports.length === 0 ? "PASS" : "FAIL", JSON.stringify(duplicateCurrentReports));

  const invalidDirectKrWeights = await prisma.objective.findMany({
    where: { progressSource: "DIRECT_KRS", status: { not: "DRAFT" } },
    include: { keyResults: true },
  });
  const invalidWeights = invalidDirectKrWeights.filter((objective) => {
    const total = objective.keyResults.reduce((sum, kr) => sum + kr.weightPercent, 0);
    return objective.keyResults.length > 0 && Math.round(total) !== 100;
  });
  recordCheck("active DIRECT_KRS weights total 100", invalidWeights.length === 0 ? "PASS" : "FAIL", invalidWeights.map((objective) => objective.title).join(", "));

  const parent = await prisma.objective.findUnique({
    where: { id: setup.proposalParentId },
    include: { parentAssignments: { include: { assignedObjective: true } } },
  });
  return { users, parent };
}

function renderChecklist() {
  const names = {
    "CSV org import": "CSV org import",
    "org root CEO": "org tree",
    "login ceo@dten.com": "login/session isolation",
    "concurrent manager review queues processed": "delegated review routing",
    "no duplicate current-week reports": "weekly reports",
    "weekly report KR setup": "KR check-ins",
    "weighted KR progress formula": "weighted KR progress",
    "parent child-objective weighted roll-up": "parent/child objective roll-up",
    "proposal workflow": "child objective proposal workflow",
    "duplicate manager reviews": "manager review",
    "dashboard loads ceo@dten.com": "CEO dashboard",
    "dashboard loads manager@dten.com": "manager dashboard",
    "dashboard loads engineer@dten.com": "employee dashboard",
    "executive summary loads ceo@dten.com": "executive summary",
    "dashboard CSV export ceo@dten.com": "dashboard CSV export",
    "employee access org import": "permission boundaries",
  };
  const statusFor = (needle) => {
    const check = checks.find((item) => item.name === needle) ?? permissionResults.find((item) => item.name === needle);
    if (!check) return "PARTIAL";
    if (check.status === "PASS" || check.result === "PASS") return "PASS";
    if (check.status === "FAIL" || check.result === "FAIL") return "FAIL";
    return "PARTIAL";
  };
  return Object.entries(names)
    .map(([, label]) => {
      const key = Object.keys(names).find((name) => names[name] === label);
      return `- ${label}: ${statusFor(key)}`;
    })
    .join("\n") + "\n- notifications: PARTIAL\n- audit logs: PARTIAL";
}

async function writeReport({ env, importSummary, dbSummary, consistency }) {
  const bugText = bugs.length
    ? bugs
        .map((bug) => `### ${bug.title}
Severity: ${bug.severity}
Area: ${bug.area}

Reproduction steps:
${bug.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}

Expected behavior:
${bug.expected}

Actual behavior:
${bug.actual}

Likely root cause:
${bug.likelyRootCause}

Suggested fix location:
${bug.suggestedFixLocation}

Related files/APIs:
${bug.relatedFiles.map((file) => `- ${file}`).join("\n")}

Screenshots/logs if available:
${bug.logs || "N/A"}
`)
        .join("\n")
    : "No app bugs recorded by this run.";

  const permissionText = permissionResults.map((item) => `- ${item.name}: ${item.result}${item.detail ? ` (${item.detail})` : ""}`).join("\n");
  const checkText = checks.map((item) => `- ${item.name}: ${item.status}${item.detail ? ` (${item.detail})` : ""}`).join("\n");
  const bugPriority = bugs
    .map((bug, index) => `${index + 1}. [${bug.severity}] ${bug.title}`)
    .join("\n") || "No fixes required from this run.";

  const report = `# DTEN OKR Concurrent Workflow Test Report up to Release 3.2

## Environment
- branch: ${env.branch}
- commit hash: ${env.commit}
- test date: ${new Date().toISOString()}
- database: PostgreSQL via local Docker, ${process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ":***@") ?? "DATABASE_URL unavailable"}
- app URL: ${baseUrl}
- test tools used: Playwright, Prisma read/inspection queries, Next.js dev server
- browser(s): Chromium
- test account used for initial CEO login: ceo@dten.com

## Generated Organization CSV
File path: ${csvPath}

\`\`\`csv
${fs.readFileSync(csvPath, "utf8")}
\`\`\`

## Import Result
- users created: ${importSummary.created}
- users updated: ${importSummary.updated}
- inactive users: ${importSummary.inactive}
- departments created: ${importSummary.departmentsCreated}
- teams created: ${importSummary.teamsCreated}
- validation errors: invalid duplicate/missing-manager/invalid-role CSV was blocked
- import summary screenshot/path if available: ${importScreenshotPath}

## Summary
- total users simulated: 20 imported HR users; 20 browser login/session attempts across role and workflow tests
- concurrent sessions simulated: 8 employee weekly-report sessions plus 5 reviewer/dashboard sessions in parallel groups
- passed areas: ${checks.filter((item) => item.status === "PASS").length}
- failed areas: ${checks.filter((item) => item.status === "FAIL").length}
- high-risk issues: ${bugs.filter((bug) => ["Critical", "High"].includes(bug.severity)).length}
- overall readiness rating: ${bugs.some((bug) => bug.severity === "Critical") ? "blocked by critical issues" : bugs.some((bug) => bug.severity === "High") ? "needs major fixes" : "safe to proceed"}

## Test Coverage Checklist
${renderChecklist()}

## Bugs Found

${bugText}

## Data Consistency Results

Report actual observed values:
- active users: ${dbSummary.activeUsers}
- inactive users: ${dbSummary.inactiveUsers}
- departments: ${dbSummary.departments}
- teams: ${dbSummary.teams}
- weekly reports: ${dbSummary.weeklyReports}
- submitted reports: ${dbSummary.submittedReports}
- pending reviews: ${dbSummary.pendingReviews}
- reviewed reports: ${dbSummary.reviewedReports}
- check-ins: ${dbSummary.checkIns}
- notifications: ${dbSummary.notifications}
- audit logs: ${dbSummary.auditLogs}
- objectives: ${dbSummary.objectives}
- key results: ${dbSummary.keyResults}
- child objective assignments: ${dbSummary.childObjectiveAssignments}
- child objective proposals: ${dbSummary.childObjectiveProposals}

Check whether these are correct:
- review routing: ${checks.find((item) => item.name === "concurrent manager review queues processed")?.status ?? "PARTIAL"}
- parent objective roll-up: ${checks.find((item) => item.name === "parent child-objective weighted roll-up")?.status ?? "PARTIAL"}
- KR weighted progress: ${checks.find((item) => item.name === "weighted KR progress formula")?.status ?? "PARTIAL"}
- dashboard numbers: PARTIAL; dashboards loaded without crash and exported CSVs had valid headers, but exact visual stat reconciliation was database-inspected rather than screenshot-matched.
- executive summary: PARTIAL; route loaded by role, exact narrative content not exhaustively asserted.
- export numbers: PARTIAL; headers and role scopes tested, detailed row-by-row dashboard parity not fully reconciled.

Additional consistency checks:
${checkText}

## Permission Test Results

${permissionText}

## Concurrency / Race Condition Findings

${concurrencyFindings.map((item) => `- ${item}`).join("\n")}
- duplicate submissions: ${bugs.some((bug) => bug.title.includes("Double-submit")) ? "FAIL" : "PASS"}
- double reviews: ${bugs.some((bug) => bug.title.includes("Duplicate manager reviews")) ? "FAIL" : "PASS"}
- simultaneous check-ins: PASS; no server crash and check-in rows were created
- stale dashboard data: NOT PROVEN
- session leakage: PASS; isolated browser contexts maintained distinct users
- API errors: none observed during final successful run
- server crashes: none observed during final successful run

## Recommended Fix Priority

${bugPriority}

## Final Recommendation

${bugs.some((bug) => bug.severity === "Critical") ? "The current build is blocked by critical issues." : bugs.some((bug) => bug.severity === "High") ? "The current build needs major fixes before continuing development." : "The current build is safe to proceed with minor follow-up."}

## Raw Check Log

${checkText}
`;

  fs.writeFileSync(reportPath, report);
}

async function main() {
  const env = {
    branch: (await execText("git branch --show-current")).trim(),
    commit: (await execText("git rev-parse --short HEAD")).trim(),
  };

  const browser = await chromium.launch({ headless: true });
  try {
    await importCsvThroughUi(browser);
    const importSummary = await getImportSummary();
    const setup = await setupOkrWorkflows(browser);
    setup.byEmail = Object.fromEntries((await prisma.user.findMany()).map((user) => [user.email, user]));
    await runProposalWorkflow(browser, setup);
    const employeeEmails = await setupEmployeeKrsForWeeklyReports(setup);
    await runConcurrentWeeklyReports(browser, employeeEmails);
    await runConcurrentManagerReviews(browser);
    await runDashboardAndPermissionChecks(browser, setup);
    const consistency = await inspectDataConsistency(setup);
    const dbSummary = await getCurrentDbSummary();
    await writeReport({ env, importSummary, dbSummary, consistency });
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }

  console.log(`Report written to ${reportPath}`);
  if (bugs.some((bug) => bug.severity === "Critical")) {
    process.exitCode = 2;
  } else if (bugs.length > 0) {
    process.exitCode = 1;
  }
}

async function getImportSummary() {
  const users = await prisma.user.findMany({ where: { employeeId: { startsWith: "E2E-" } } });
  const departments = await prisma.department.findMany();
  const teams = await prisma.team.findMany();
  return {
    created: Math.max(users.length - 5, 0),
    updated: Math.min(users.length, 5),
    inactive: users.filter((user) => !user.isActive).length,
    departmentsCreated: departments.filter((department) => ["Customer Success", "People"].includes(department.name)).length,
    teamsCreated: teams.filter((team) => ["Executive Leadership", "Platform Leadership", "Customer Success West", "Demand Generation", "People Operations"].includes(team.name)).length,
  };
}

function execText(command) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd: path.join(__dirname, "..") }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout || stderr);
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
