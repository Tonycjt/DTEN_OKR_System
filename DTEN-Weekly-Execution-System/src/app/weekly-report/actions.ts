"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PriorityStatus, PriorityType } from "@prisma/client";
import { getMondayWeekStart, getSundayWeekEnd } from "@/lib/week";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

const priorityTypes: PriorityType[] = ["KR_LINKED", "AD_HOC"];
const priorityStatuses: PriorityStatus[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DONE"];

function optionalString(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function requiredString(value: FormDataEntryValue | null, fieldName: string) {
  const text = optionalString(value);

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

export async function ensureCurrentWeeklyReport(userId: string) {
  const weekStart = getMondayWeekStart();
  const weekEnd = getSundayWeekEnd(weekStart);

  return prisma.weeklyReport.upsert({
    where: {
      userId_weekStart: {
        userId,
        weekStart,
      },
    },
    create: {
      userId,
      weekStart,
      weekEnd,
      status: "DRAFT",
    },
    update: {},
    include: {
      priorities: {
        orderBy: { createdAt: "asc" },
        include: {
          linkedKeyResult: {
            include: {
              objective: true,
            },
          },
        },
      },
    },
  });
}

export async function updateWeeklyReportSummaryAction(formData: FormData) {
  const user = await requireUser();
  const weeklyReportId = requiredString(formData.get("weeklyReportId"), "Weekly report");

  await prisma.weeklyReport.update({
    where: {
      id: weeklyReportId,
      userId: user.id,
    },
    data: {
      summary: optionalString(formData.get("summary")),
      status: "DRAFT",
    },
  });

  revalidatePath("/weekly-report/current");
}

export async function addWeeklyPriorityAction(formData: FormData) {
  const user = await requireUser();
  const weeklyReportId = requiredString(formData.get("weeklyReportId"), "Weekly report");
  const type = requiredString(formData.get("type"), "Priority type") as PriorityType;
  const linkedKeyResultId = optionalString(formData.get("linkedKeyResultId"));

  if (!priorityTypes.includes(type)) {
    throw new Error("Invalid priority type.");
  }

  if (type === "KR_LINKED" && !linkedKeyResultId) {
    redirect("/weekly-report/current?error=kr-required");
  }

  const report = await prisma.weeklyReport.findFirst({
    where: {
      id: weeklyReportId,
      userId: user.id,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!report) {
    throw new Error("Weekly report not found.");
  }

  if (report.status !== "DRAFT" && report.status !== "NEEDS_FOLLOW_UP") {
    redirect("/weekly-report/current?error=submitted");
  }

  await prisma.weeklyPriority.create({
    data: {
      weeklyReportId,
      type,
      content: requiredString(formData.get("content"), "Priority"),
      status: "NOT_STARTED",
      resultSummary: optionalString(formData.get("resultSummary")),
      blocker: optionalString(formData.get("blocker")),
      nextStep: optionalString(formData.get("nextStep")),
      linkedKeyResultId: type === "KR_LINKED" ? linkedKeyResultId : null,
    },
  });

  revalidatePath("/weekly-report/current");
}

export async function updateWeeklyPriorityAction(formData: FormData) {
  const user = await requireUser();
  const priorityId = requiredString(formData.get("priorityId"), "Priority");
  const type = requiredString(formData.get("type"), "Priority type") as PriorityType;
  const status = requiredString(formData.get("status"), "Priority status") as PriorityStatus;
  const linkedKeyResultId = optionalString(formData.get("linkedKeyResultId"));

  if (!priorityTypes.includes(type)) {
    throw new Error("Invalid priority type.");
  }

  if (!priorityStatuses.includes(status)) {
    throw new Error("Invalid priority status.");
  }

  if (type === "KR_LINKED" && !linkedKeyResultId) {
    redirect("/weekly-report/current?error=kr-required");
  }

  await prisma.weeklyPriority.update({
    where: {
      id: priorityId,
      weeklyReport: {
        userId: user.id,
      },
    },
    data: {
      type,
      content: requiredString(formData.get("content"), "Priority"),
      status,
      resultSummary: optionalString(formData.get("resultSummary")),
      blocker: optionalString(formData.get("blocker")),
      nextStep: optionalString(formData.get("nextStep")),
      linkedKeyResultId: type === "KR_LINKED" ? linkedKeyResultId : null,
    },
  });

  revalidatePath("/weekly-report/current");
  revalidatePath("/weekly-report/history");
}

export async function deleteWeeklyPriorityAction(formData: FormData) {
  const user = await requireUser();
  const priorityId = requiredString(formData.get("priorityId"), "Priority");

  await prisma.weeklyPriority.delete({
    where: {
      id: priorityId,
      weeklyReport: {
        userId: user.id,
      },
    },
  });

  revalidatePath("/weekly-report/current");
}

export async function submitWeeklyReportAction(formData: FormData) {
  const user = await requireUser();
  const weeklyReportId = requiredString(formData.get("weeklyReportId"), "Weekly report");

  const report = await prisma.weeklyReport.findFirst({
    where: {
      id: weeklyReportId,
      userId: user.id,
    },
    include: {
      priorities: true,
      user: {
        include: {
          manager: true,
        },
      },
    },
  });

  if (!report) {
    throw new Error("Weekly report not found.");
  }

  if (report.priorities.length === 0) {
    redirect("/weekly-report/current?error=no-priorities");
  }

  const missingKrLink = report.priorities.some((priority) => priority.type === "KR_LINKED" && !priority.linkedKeyResultId);

  if (missingKrLink) {
    redirect("/weekly-report/current?error=kr-required");
  }

  await prisma.weeklyReport.update({
    where: {
      id: report.id,
    },
    data: {
      summary: optionalString(formData.get("summary")) ?? report.summary,
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });

  if (report.user.managerId) {
    await prisma.notification.create({
      data: {
        userId: report.user.managerId,
        type: "REPORT_SUBMITTED",
        title: "Weekly report submitted",
        body: `${report.user.name} submitted a weekly report for review.`,
        relatedUrl: "/reviews/pending",
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "SUBMITTED",
      entityType: "WeeklyReport",
      entityId: report.id,
      metadata: {
        weekStart: report.weekStart.toISOString(),
        priorityCount: report.priorities.length,
      },
    },
  });

  revalidatePath("/weekly-report/current");
  revalidatePath("/weekly-report/history");
  redirect("/weekly-report/history");
}
