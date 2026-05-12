import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(databaseUrl),
});

const password = "Password123!";

async function resetDatabase() {
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.managerReview.deleteMany();
  await prisma.checkIn.deleteMany();
  await prisma.weeklyPriority.deleteMany();
  await prisma.weeklyReport.deleteMany();
  await prisma.monthlyTarget.deleteMany();
  await prisma.keyResult.deleteMany();
  await prisma.objective.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();
  await prisma.department.deleteMany();
}

async function main() {
  const passwordHash = await bcrypt.hash(password, 10);

  await resetDatabase();

  const executive = await prisma.department.create({
    data: {
      name: "Executive",
      description: "Company leadership and executive visibility.",
    },
  });

  const productEngineering = await prisma.department.create({
    data: {
      name: "Product Engineering",
      description: "Product, platform, certification, and delivery execution.",
    },
  });

  const sales = await prisma.department.create({
    data: {
      name: "Sales",
      description: "Revenue, pipeline, demos, and customer conversion.",
    },
  });

  await prisma.department.create({
    data: {
      name: "Marketing",
      description: "Campaigns, positioning, demand generation, and launches.",
    },
  });

  const androidTeam = await prisma.team.create({
    data: {
      name: "Android Team",
      description: "Android product readiness and platform delivery.",
      departmentId: productEngineering.id,
    },
  });

  const certificationTeam = await prisma.team.create({
    data: {
      name: "Certification Team",
      description: "Certification readiness and partner validation.",
      departmentId: productEngineering.id,
    },
  });

  const salesTeam = await prisma.team.create({
    data: {
      name: "Sales Team",
      description: "Qualified demos and pipeline execution.",
      departmentId: sales.id,
    },
  });

  const ceo = await prisma.user.create({
    data: {
      email: "ceo@dten.com",
      passwordHash,
      name: "Casey Chen",
      role: "CEO",
      title: "CEO",
      departmentId: executive.id,
    },
  });

  const departmentHead = await prisma.user.create({
    data: {
      email: "head@dten.com",
      passwordHash,
      name: "Morgan Lee",
      role: "DEPARTMENT_HEAD",
      title: "Head of Product Engineering",
      departmentId: productEngineering.id,
      managerId: ceo.id,
      reviewOwnerId: ceo.id,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: "manager@dten.com",
      passwordHash,
      name: "Avery Park",
      role: "MANAGER",
      title: "Certification Manager",
      departmentId: productEngineering.id,
      teamId: certificationTeam.id,
      managerId: departmentHead.id,
      reviewOwnerId: departmentHead.id,
    },
  });

  const engineer = await prisma.user.create({
    data: {
      email: "engineer@dten.com",
      passwordHash,
      name: "Riley Wong",
      role: "EMPLOYEE",
      title: "Senior Engineer",
      departmentId: productEngineering.id,
      teamId: androidTeam.id,
      managerId: manager.id,
      reviewOwnerId: manager.id,
    },
  });

  const salesUser = await prisma.user.create({
    data: {
      email: "sales@dten.com",
      passwordHash,
      name: "Jordan Smith",
      role: "EMPLOYEE",
      title: "Account Executive",
      departmentId: sales.id,
      teamId: salesTeam.id,
      managerId: ceo.id,
      reviewOwnerId: ceo.id,
    },
  });

  const companyRevenue = await prisma.objective.create({
    data: {
      title: "Deliver predictable revenue growth",
      description: "Create a reliable weekly execution rhythm for pipeline and revenue visibility.",
      level: "COMPANY",
      status: "ON_TRACK",
      quarter: "2026-Q2",
      progressPercent: 42,
      confidenceScore: 4,
      ownerId: ceo.id,
      departmentId: executive.id,
    },
  });

  const companyProduct = await prisma.objective.create({
    data: {
      title: "Re-establish product and solution leadership",
      description: "Improve release readiness, certifications, and executive visibility into product execution risk.",
      level: "COMPANY",
      status: "AT_RISK",
      quarter: "2026-Q2",
      progressPercent: 33,
      confidenceScore: 3,
      ownerId: ceo.id,
      departmentId: executive.id,
    },
  });

  const certificationObjective = await prisma.objective.create({
    data: {
      title: "Drive product certifications and GA readiness",
      description: "Make certification progress visible week by week before the quarter closes.",
      level: "DEPARTMENT",
      status: "AT_RISK",
      quarter: "2026-Q2",
      progressPercent: 38,
      confidenceScore: 3,
      ownerId: departmentHead.id,
      departmentId: productEngineering.id,
      teamId: certificationTeam.id,
      parentObjectiveId: companyProduct.id,
    },
  });

  const shipD7x = await prisma.keyResult.create({
    data: {
      title: "Ship D7X AI 55 inch to production",
      metricName: "Production readiness percent",
      objectiveId: companyProduct.id,
      ownerId: engineer.id,
      startValue: 0,
      currentValue: 48,
      targetValue: 100,
      progressPercent: 48,
      confidenceScore: 3,
      status: "AT_RISK",
      pacingStatus: "BEHIND",
    },
  });

  const teamsCertification = await prisma.keyResult.create({
    data: {
      title: "Complete Microsoft Teams certification",
      metricName: "Certification progress percent",
      objectiveId: certificationObjective.id,
      ownerId: manager.id,
      startValue: 0,
      currentValue: 55,
      targetValue: 100,
      progressPercent: 55,
      confidenceScore: 3,
      status: "AT_RISK",
      pacingStatus: "BEHIND",
    },
  });

  const demosPerWeek = await prisma.keyResult.create({
    data: {
      title: "Deliver 15 qualified demos per week",
      metricName: "Qualified demos",
      objectiveId: companyRevenue.id,
      ownerId: salesUser.id,
      startValue: 0,
      currentValue: 11,
      targetValue: 15,
      progressPercent: 73,
      confidenceScore: 4,
      status: "ON_TRACK",
      pacingStatus: "ON_PACE",
    },
  });

  await prisma.monthlyTarget.createMany({
    data: [
      { keyResultId: shipD7x.id, monthIndex: 1, targetValue: 35, targetPercent: 35 },
      { keyResultId: shipD7x.id, monthIndex: 2, targetValue: 70, targetPercent: 70 },
      { keyResultId: shipD7x.id, monthIndex: 3, targetValue: 100, targetPercent: 100 },
      { keyResultId: teamsCertification.id, monthIndex: 1, targetValue: 40, targetPercent: 40 },
      { keyResultId: teamsCertification.id, monthIndex: 2, targetValue: 75, targetPercent: 75 },
      { keyResultId: teamsCertification.id, monthIndex: 3, targetValue: 100, targetPercent: 100 },
      { keyResultId: demosPerWeek.id, monthIndex: 1, targetValue: 10, targetPercent: 67 },
      { keyResultId: demosPerWeek.id, monthIndex: 2, targetValue: 13, targetPercent: 87 },
      { keyResultId: demosPerWeek.id, monthIndex: 3, targetValue: 15, targetPercent: 100 },
    ],
  });

  const weekStart = new Date("2026-05-04T00:00:00.000Z");
  const weekEnd = new Date("2026-05-10T23:59:59.999Z");

  const weeklyReport = await prisma.weeklyReport.create({
    data: {
      userId: engineer.id,
      weekStart,
      weekEnd,
      status: "NEEDS_FOLLOW_UP",
      submittedAt: new Date("2026-05-11T18:00:00.000Z"),
      reviewedAt: new Date("2026-05-11T20:00:00.000Z"),
      summary: "Focused on D7X AI readiness and surfaced certification dependency risks.",
    },
  });

  const priority = await prisma.weeklyPriority.create({
    data: {
      weeklyReportId: weeklyReport.id,
      type: "KR_LINKED",
      content: "Close remaining production readiness gaps for D7X AI 55 inch.",
      linkedKeyResultId: shipD7x.id,
      status: "IN_PROGRESS",
      resultSummary: "Readiness moved from 40 percent to 48 percent.",
      blocker: "Waiting on final partner validation signal.",
      nextStep: "Escalate blocker during manager review.",
    },
  });

  await prisma.checkIn.create({
    data: {
      keyResultId: shipD7x.id,
      weeklyReportId: weeklyReport.id,
      weeklyPriorityId: priority.id,
      userId: engineer.id,
      previousValue: 40,
      newValue: 48,
      progressPercent: 48,
      confidenceScore: 3,
      status: "AT_RISK",
      blocker: "Partner validation not complete.",
      note: "Progress improved, but pacing remains behind the month two target.",
    },
  });

  await prisma.managerReview.create({
    data: {
      weeklyReportId: weeklyReport.id,
      managerId: manager.id,
      decision: "RISK_FLAGGED",
      comment: "Please bring the partner validation blocker to the certification sync.",
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: manager.id,
        type: "REPORT_SUBMITTED",
        title: "Weekly report submitted",
        body: `${engineer.name} submitted a weekly report for review.`,
        relatedUrl: "/reviews/pending",
      },
      {
        userId: engineer.id,
        type: "FOLLOW_UP_REQUESTED",
        title: "Follow-up requested",
        body: `${manager.name} requested follow-up on a D7X AI blocker.`,
        relatedUrl: "/weekly-report/history",
      },
      {
        userId: departmentHead.id,
        type: "FOLLOW_UP_REQUESTED",
        title: "Risk escalated",
        body: `${manager.name} flagged a weekly report risk for escalation.`,
        relatedUrl: "/dashboard",
      },
      {
        userId: ceo.id,
        type: "KR_COMMENT",
        title: "High-risk KR needs attention",
        body: "D7X AI production readiness is behind pacing for the current month.",
        relatedUrl: `/key-results/${shipD7x.id}`,
      },
    ],
  });

  await prisma.comment.create({
    data: {
      keyResultId: shipD7x.id,
      authorId: ceo.id,
      body: "Please keep this KR visible in the leadership dashboard until the partner blocker is closed.",
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        actorId: ceo.id,
        action: "CREATED",
        entityType: "Objective",
        entityId: companyProduct.id,
        metadata: { title: companyProduct.title },
      },
      {
        actorId: engineer.id,
        action: "SUBMITTED",
        entityType: "WeeklyReport",
        entityId: weeklyReport.id,
        metadata: { weekStart: weekStart.toISOString(), weekEnd: weekEnd.toISOString() },
      },
      {
        actorId: manager.id,
        action: "REVIEWED",
        entityType: "WeeklyReport",
        entityId: weeklyReport.id,
        metadata: { decision: "RISK_FLAGGED", escalationOwnerId: departmentHead.id },
      },
    ],
  });

  console.log(`Seeded Release 1 demo data. Login password for all users: ${password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
