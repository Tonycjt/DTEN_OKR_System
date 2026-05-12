import type { WeeklyReport } from "@prisma/client";
import { formatWeekRange, getMondayWeekStart, getSundayWeekEnd } from "../lib/week";
import { sendWeeklyReportOverdueEmail } from "./email-notifications";
import { prisma } from "./prisma";

const submittedStatuses = new Set(["SUBMITTED", "REVIEWED", "NEEDS_FOLLOW_UP"]);

function getPreviousWeekStart(date = new Date()) {
  const currentWeekStart = getMondayWeekStart(date);
  return new Date(currentWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
}

async function ensureOverdueReport(userId: string, weekStart: Date, weekEnd: Date) {
  const existingReport = await prisma.weeklyReport.findUnique({
    where: {
      userId_weekStart: {
        userId,
        weekStart,
      },
    },
  });

  if (existingReport && submittedStatuses.has(existingReport.status)) {
    return null;
  }

  if (existingReport?.status === "OVERDUE") {
    return null;
  }

  if (existingReport) {
    return prisma.weeklyReport.update({
      where: { id: existingReport.id },
      data: { status: "OVERDUE" },
    });
  }

  return prisma.weeklyReport.create({
    data: {
      userId,
      weekStart,
      weekEnd,
      status: "OVERDUE",
    },
  });
}

async function createOverdueNotification(userId: string, report: WeeklyReport, weekLabel: string) {
  const existingNotification = await prisma.notification.findFirst({
    where: {
      userId,
      type: "WEEKLY_REPORT_OVERDUE",
      body: `Your weekly report for ${weekLabel} is overdue.`,
    },
  });

  if (existingNotification) {
    return;
  }

  await prisma.notification.create({
    data: {
      userId,
      type: "WEEKLY_REPORT_OVERDUE",
      title: "Weekly report overdue",
      body: `Your weekly report for ${weekLabel} is overdue.`,
      relatedUrl: "/weekly-report/current",
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: null,
      action: "UPDATED",
      entityType: "WeeklyReport",
      entityId: report.id,
      metadata: {
        status: "OVERDUE",
        weekStart: report.weekStart.toISOString(),
        source: "weekly-report-overdue-email-job",
      },
    },
  });
}

export async function processWeeklyReportOverdueEmails(date = new Date()) {
  const weekStart = getPreviousWeekStart(date);
  const weekEnd = getSundayWeekEnd(weekStart);
  const weekLabel = formatWeekRange(weekStart, weekEnd);

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: {
        in: ["DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE"],
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
    orderBy: { name: "asc" },
  });

  const emailedUsers: string[] = [];

  for (const user of users) {
    const overdueReport = await ensureOverdueReport(user.id, weekStart, weekEnd);

    if (!overdueReport) {
      continue;
    }

    await createOverdueNotification(user.id, overdueReport, weekLabel);
    await sendWeeklyReportOverdueEmail({
      user,
      weekStart,
      weekEnd,
      relatedPath: "/weekly-report/current",
    });

    emailedUsers.push(user.email);
  }

  return {
    weekStart,
    weekEnd,
    emailedUsers,
  };
}
