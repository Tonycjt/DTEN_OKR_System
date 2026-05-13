import "dotenv/config";
import { chromium } from "playwright";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:3000";
const password = process.env.QA_PASSWORD ?? "Password123!";
const runTag = `QUICK REGRESSION ${new Date().toISOString().replace(/[:.]/g, "-")}`;

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL),
});

function getMondayWeekStart() {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = utc.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(utc.getTime() + diff * 24 * 60 * 60 * 1000);
}

function getSundayWeekEnd(weekStart) {
  const sunday = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  sunday.setUTCHours(23, 59, 59, 999);
  return sunday;
}

async function login(browser, email) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error("AUTH_SECRET is required.");
  }

  const token = await new SignJWT({ userId: user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(new TextEncoder().encode(secret));

  const context = await browser.newContext();
  await context.addCookies([
    {
      name: "dten_session",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/dashboard`);
  await page.waitForLoadState("networkidle");
  if (!page.url().includes("/dashboard")) {
    throw new Error(`Login failed for ${email}: ${page.url()}`);
  }
  return { context, page };
}

async function createReport({ userEmail, status }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: userEmail } });
  const weekStart = getMondayWeekStart();
  const weekEnd = getSundayWeekEnd(weekStart);

  await prisma.weeklyReport.deleteMany({
    where: {
      userId: user.id,
      weekStart,
    },
  });

  const report = await prisma.weeklyReport.create({
    data: {
      userId: user.id,
      weekStart,
      weekEnd,
      status,
      submittedAt: status === "SUBMITTED" ? new Date() : null,
      summary: `${runTag} ${status} report`,
      priorities: {
        create: {
          type: "AD_HOC",
          content: `${runTag} ad-hoc priority`,
          status: "IN_PROGRESS",
        },
      },
    },
  });

  return { user, report, weekStart };
}

async function checkManagerReviewIdempotency(browser) {
  const { report } = await createReport({ userEmail: "engineer@dten.com", status: "SUBMITTED" });
  const sessions = await Promise.all(Array.from({ length: 5 }, () => login(browser, "manager@dten.com")));

  await Promise.all(
    sessions.map(async ({ page }) => {
      await page.goto(`${baseUrl}/reviews/pending`);
      await page.getByText("QUICK REGRESSION", { exact: false }).first().waitFor({ timeout: 15000 });
    })
  );

  const clicks = sessions.map(({ page }) =>
    page.getByRole("button", { name: "Submit Review" }).first().click({ timeout: 15000 }).catch((error) => error)
  );
  await Promise.all(clicks);
  await Promise.all(sessions.map(({ page }) => page.waitForLoadState("networkidle").catch(() => null)));

  const [reviewCount, refreshedReport, reviewedNotifications] = await Promise.all([
    prisma.managerReview.count({ where: { weeklyReportId: report.id } }),
    prisma.weeklyReport.findUniqueOrThrow({ where: { id: report.id } }),
    prisma.notification.count({
      where: {
        type: "REPORT_REVIEWED",
        user: { email: "engineer@dten.com" },
        createdAt: { gte: report.createdAt },
      },
    }),
  ]);

  await Promise.all(sessions.map(({ context }) => context.close()));

  return {
    name: "manager review duplicate prevention",
    pass: reviewCount === 1 && refreshedReport.status === "REVIEWED" && reviewedNotifications === 1,
    details: { reviewCount, reportStatus: refreshedReport.status, reviewedNotifications },
  };
}

async function checkWeeklyDoubleSubmit(browser) {
  const { user, report, weekStart } = await createReport({ userEmail: "sales@dten.com", status: "DRAFT" });
  const sessions = await Promise.all(Array.from({ length: 5 }, () => login(browser, "sales@dten.com")));

  await Promise.all(
    sessions.map(async ({ page }) => {
      await page.goto(`${baseUrl}/weekly-report/current`);
      await page.getByRole("button", { name: "Submit Weekly Report" }).waitFor({ timeout: 15000 });
    })
  );

  const clicks = sessions.map(({ page }) =>
    page.getByRole("button", { name: "Submit Weekly Report" }).click({ timeout: 15000 }).catch((error) => error)
  );
  await Promise.all(clicks);
  await Promise.all(sessions.map(({ page }) => page.waitForLoadState("networkidle").catch(() => null)));

  const [reportCount, refreshedReport, reviewNotifications, submitAuditLogs] = await Promise.all([
    prisma.weeklyReport.count({ where: { userId: user.id, weekStart } }),
    prisma.weeklyReport.findUniqueOrThrow({ where: { id: report.id } }),
    prisma.notification.count({
      where: {
        type: "REVIEW_REQUESTED",
        user: { email: "ceo@dten.com" },
        relatedUrl: "/reviews/pending",
        createdAt: { gte: report.createdAt },
      },
    }),
    prisma.auditLog.count({
      where: {
        action: "SUBMITTED",
        entityType: "WeeklyReport",
        entityId: report.id,
        createdAt: { gte: report.createdAt },
      },
    }),
  ]);

  await Promise.all(sessions.map(({ context }) => context.close()));

  return {
    name: "weekly report double-submit safety",
    pass: reportCount === 1 && refreshedReport.status === "SUBMITTED" && reviewNotifications === 1 && submitAuditLogs === 1,
    details: { reportCount, reportStatus: refreshedReport.status, reviewNotifications, submitAuditLogs },
  };
}

async function checkProposalApproval(browser) {
  const ceo = await prisma.user.findUniqueOrThrow({ where: { email: "ceo@dten.com" } });
  const head = await prisma.user.findUniqueOrThrow({ where: { email: "head@dten.com" } });

  const parent = await prisma.objective.create({
    data: {
      title: `${runTag} proposal parent`,
      level: "COMPANY",
      status: "ON_TRACK",
      quarter: "2026-Q2",
      progressSource: "CHILD_OBJECTIVES",
      ownerId: ceo.id,
      confidenceScore: 3,
    },
  });

  const child = await prisma.objective.create({
    data: {
      title: `${runTag} proposal child`,
      level: "DEPARTMENT",
      status: "ON_TRACK",
      quarter: "2026-Q2",
      progressSource: "MANUAL",
      progressPercent: 70,
      ownerId: head.id,
      confidenceScore: 4,
    },
  });

  const assignment = await prisma.objectiveAssignment.create({
    data: {
      parentObjectiveId: parent.id,
      assignedObjectiveId: child.id,
      assigneeId: head.id,
      assigneeType: "USER",
      contributionPercent: 100,
      assignmentMode: "CONTRIBUTION_ONLY",
      status: "PENDING_REVIEW",
      createdById: ceo.id,
    },
  });

  const { context, page } = await login(browser, "ceo@dten.com");
  await page.goto(`${baseUrl}/objectives/${parent.id}`);
  await page.getByRole("button", { name: "Approve" }).click();
  await page.waitForLoadState("networkidle");

  const refreshed = await prisma.objectiveAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
  const refreshedParent = await prisma.objective.findUniqueOrThrow({ where: { id: parent.id } });
  await context.close();

  return {
    name: "approved proposal becomes ACTIVE",
    pass: refreshed.status === "ACTIVE" && Math.round(refreshedParent.progressPercent) === 70,
    details: { assignmentStatus: refreshed.status, parentProgress: refreshedParent.progressPercent },
  };
}

async function checkObjectiveEditPermission(browser) {
  const ceo = await prisma.user.findUniqueOrThrow({ where: { email: "ceo@dten.com" } });

  const objective = await prisma.objective.create({
    data: {
      title: `${runTag} CEO-owned permission probe`,
      level: "COMPANY",
      status: "DRAFT",
      quarter: "2026-Q2",
      progressSource: "MANUAL",
      progressPercent: 10,
      ownerId: ceo.id,
      confidenceScore: 3,
    },
  });

  const { context, page } = await login(browser, "engineer@dten.com");
  await page.goto(`${baseUrl}/objectives/${objective.id}`);
  await page.waitForLoadState("networkidle");

  const editVisible = await page.getByRole("heading", { name: "Edit Objective" }).isVisible().catch(() => false);
  const updateButtonVisible = await page.getByRole("button", { name: "Update Objective" }).isVisible().catch(() => false);
  const addKrVisible = await page.getByRole("heading", { name: "Add Key Result" }).isVisible().catch(() => false);

  await context.close();

  return {
    name: "employee cannot see CEO objective edit controls",
    pass: !editVisible && !updateButtonVisible,
    details: { editVisible, updateButtonVisible, addKrVisible },
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    results.push(await checkProposalApproval(browser));
    results.push(await checkObjectiveEditPermission(browser));
    results.push(await checkWeeklyDoubleSubmit(browser));
    results.push(await checkManagerReviewIdempotency(browser));
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }

  for (const result of results) {
    console.log(`${result.pass ? "PASS" : "FAIL"}: ${result.name}`);
    console.log(JSON.stringify(result.details, null, 2));
  }

  if (results.some((result) => !result.pass)) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
