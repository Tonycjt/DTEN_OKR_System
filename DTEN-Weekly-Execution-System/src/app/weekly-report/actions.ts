"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PriorityStatus, PriorityType, WorkStatus } from "@prisma/client";
import { calculatePacingStatus, calculateProgressPercent, getCurrentQuarterMonthIndex } from "@/lib/okr-calculations";
import { getEffectiveReviewOwnerId } from "@/lib/review-routing";
import { getMondayWeekStart, getSundayWeekEnd } from "@/lib/week";
import { requireUser } from "@/server/auth";
import { sendKrBlockedEmail, sendReviewRequestedEmail } from "@/server/email-notifications";
import { prisma } from "@/server/prisma";

const priorityTypes: PriorityType[] = ["KR_LINKED", "AD_HOC"];
const priorityStatuses: PriorityStatus[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DONE"];
const workStatuses: WorkStatus[] = ["DRAFT", "ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETED", "ON_HOLD"];

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

function numberValue(value: FormDataEntryValue | null, fallback: number) {
  const text = optionalString(value);

  if (!text) {
    return fallback;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function intValue(value: FormDataEntryValue | null, fallback: number) {
  return Math.round(numberValue(value, fallback));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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
              monthlyTargets: {
                orderBy: { monthIndex: "asc" },
              },
              checkIns: {
                where: { userId },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          },
          checkIns: {
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: 1,
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
        select: {
          id: true,
          email: true,
          name: true,
          managerId: true,
          reviewOwnerId: true,
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

  const reviewOwnerId = getEffectiveReviewOwnerId(report.user);

  const reviewOwner = reviewOwnerId
    ? await prisma.user.findUnique({
        where: { id: reviewOwnerId },
        select: {
          id: true,
          email: true,
          name: true,
        },
      })
    : null;

  if (reviewOwner) {
    await prisma.notification.create({
      data: {
        userId: reviewOwner.id,
        type: "REVIEW_REQUESTED",
        title: "Review requested",
        body: `${report.user.name} submitted a weekly report for review.`,
        relatedUrl: "/reviews/pending",
      },
    });

    await sendReviewRequestedEmail({
      reviewer: reviewOwner,
      reportOwner: report.user,
      weekStart: report.weekStart,
      weekEnd: report.weekEnd,
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
        reviewOwnerId,
      },
    },
  });

  revalidatePath("/weekly-report/current");
  revalidatePath("/weekly-report/history");
  revalidatePath("/reviews/pending");
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
  redirect("/weekly-report/history");
}

export async function savePriorityCheckInAction(formData: FormData) {
  const user = await requireUser();
  const priorityId = requiredString(formData.get("priorityId"), "Priority");
  const status = requiredString(formData.get("status"), "Status") as WorkStatus;

  if (!workStatuses.includes(status)) {
    throw new Error("Invalid KR status.");
  }

  const priority = await prisma.weeklyPriority.findFirst({
    where: {
      id: priorityId,
      weeklyReport: {
        userId: user.id,
      },
    },
    include: {
      weeklyReport: true,
      linkedKeyResult: {
        include: {
          monthlyTargets: true,
          owner: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!priority || !priority.linkedKeyResult) {
    redirect("/weekly-report/current?error=kr-required");
  }

  if (priority.weeklyReport.status !== "DRAFT" && priority.weeklyReport.status !== "NEEDS_FOLLOW_UP") {
    redirect("/weekly-report/current?error=submitted");
  }

  const linkedKeyResult = priority.linkedKeyResult;
  const keyResultId = linkedKeyResult.id;
  const newValue = numberValue(formData.get("newValue"), linkedKeyResult.currentValue);
  const progressPercent = calculateProgressPercent(linkedKeyResult.startValue, newValue, linkedKeyResult.targetValue);
  const confidenceScore = clamp(intValue(formData.get("confidenceScore"), linkedKeyResult.confidenceScore), 1, 5);
  const currentMonthIndex = getCurrentQuarterMonthIndex();
  const currentTarget = linkedKeyResult.monthlyTargets.find((target) => target.monthIndex === currentMonthIndex);
  const pacingStatus = calculatePacingStatus({
    progressPercent,
    currentMonthTargetPercent: currentTarget?.targetPercent,
  });
  const becameBlocked = linkedKeyResult.status !== "ON_HOLD" && status === "ON_HOLD";

  const existingCheckIn = await prisma.checkIn.findFirst({
    where: {
      weeklyPriorityId: priority.id,
      userId: user.id,
    },
  });

  await prisma.$transaction(async (tx) => {
    if (existingCheckIn) {
      await tx.checkIn.update({
        where: { id: existingCheckIn.id },
        data: {
          newValue,
          progressPercent,
          confidenceScore,
          status,
          blocker: optionalString(formData.get("blocker")),
          note: optionalString(formData.get("note")),
        },
      });
    } else {
      await tx.checkIn.create({
        data: {
          keyResultId,
          weeklyReportId: priority.weeklyReportId,
          weeklyPriorityId: priority.id,
          userId: user.id,
          previousValue: linkedKeyResult.currentValue,
          newValue,
          progressPercent,
          confidenceScore,
          status,
          blocker: optionalString(formData.get("blocker")),
          note: optionalString(formData.get("note")),
        },
      });
    }

    await tx.keyResult.update({
      where: { id: keyResultId },
      data: {
        currentValue: newValue,
        progressPercent,
        confidenceScore,
        status,
        pacingStatus,
      },
    });

    if (becameBlocked) {
      await tx.notification.create({
        data: {
          userId: linkedKeyResult.ownerId,
          type: "KR_BLOCKED",
          title: "KR blocked",
          body: `${linkedKeyResult.title} was marked blocked/on hold.`,
          relatedUrl: `/key-results/${keyResultId}`,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: existingCheckIn ? "UPDATED" : "CREATED",
        entityType: "CheckIn",
        entityId: existingCheckIn?.id ?? priority.id,
        metadata: {
          keyResultId,
          weeklyReportId: priority.weeklyReportId,
          newValue,
          progressPercent,
          pacingStatus,
        },
      },
    });
  });

  if (becameBlocked) {
    await sendKrBlockedEmail({
      owner: linkedKeyResult.owner,
      keyResultTitle: linkedKeyResult.title,
      blocker: optionalString(formData.get("blocker")),
      relatedPath: `/key-results/${keyResultId}`,
    });
  }

  revalidatePath("/weekly-report/current");
  revalidatePath("/weekly-report/history");
  revalidatePath(`/key-results/${keyResultId}`);
  revalidatePath(`/objectives/${linkedKeyResult.objectiveId}`);
  revalidatePath("/my-okrs");
  revalidatePath("/company-okrs");
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}
