"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PriorityStatus, WeeklyTaskSectionType, WeeklyTaskStatus, WorkStatus } from "@prisma/client";
import { calculatePacingStatus, calculateProgressPercent, getCurrentQuarterMonthIndex } from "@/lib/okr-calculations";
import { getEffectiveReviewOwnerId } from "@/lib/review-routing";
import { getMondayWeekStart, getSundayWeekEnd } from "@/lib/week";
import { requireUser } from "@/server/auth";
import { sendKrBlockedEmail, sendReviewRequestedEmail } from "@/server/email-notifications";
import { recalculateObjectiveAndParents } from "@/server/objective-rollup";
import { prisma } from "@/server/prisma";

const priorityStatuses: PriorityStatus[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DONE"];
const workStatuses: WorkStatus[] = ["DRAFT", "ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETED", "ON_HOLD"];
const weeklyTaskStatuses: WeeklyTaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "BLOCKED", "CANCELLED"];
const weeklyTaskSectionTypes: WeeklyTaskSectionType[] = ["THIS_WEEK", "NEXT_WEEK"];

function optionalString(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function requiredString(value: FormDataEntryValue | null, fieldName: string) {
  const text = optionalString(value);
  if (!text) throw new Error(`${fieldName} is required.`);
  return text;
}

function numberValue(value: FormDataEntryValue | null, fallback: number) {
  const text = optionalString(value);
  if (!text) return fallback;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function intValue(value: FormDataEntryValue | null, fallback: number) {
  return Math.round(numberValue(value, fallback));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

// Ensures the weekly report for the current week exists, then auto-links any
// standalone planned priorities (weeklyReportId = null) for this user/week.
export async function ensureCurrentWeeklyReport(userId: string) {
  const weekStart = getMondayWeekStart();
  const weekEnd = getSundayWeekEnd(weekStart);

  const report = await prisma.weeklyReport.upsert({
    where: { userId_weekStart: { userId, weekStart } },
    create: { userId, weekStart, weekEnd, status: "DRAFT" },
    update: {},
    select: { id: true },
  });

  // Auto-link planned priorities that were created before the report existed.
  await prisma.weeklyPriority.updateMany({
    where: { userId, weekStartDate: weekStart, weeklyReportId: null },
    data: { weeklyReportId: report.id },
  });

  return prisma.weeklyReport.findUniqueOrThrow({
    where: { id: report.id },
    include: {
      priorities: {
        orderBy: { createdAt: "asc" },
        include: {
          linkedKeyResult: {
            include: {
              objective: true,
              monthlyTargets: { orderBy: { monthIndex: "asc" } },
              checkIns: { where: { userId }, orderBy: { createdAt: "desc" }, take: 1 },
            },
          },
          checkIns: { where: { userId }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
      weeklyTasks: { orderBy: { createdAt: "asc" } },
      comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true } } } },
    },
  });
}

export async function updateWeeklyReportSummaryAction(formData: FormData) {
  const user = await requireUser();
  const weeklyReportId = requiredString(formData.get("weeklyReportId"), "Weekly report");

  await prisma.weeklyReport.update({
    where: { id: weeklyReportId, userId: user.id },
    data: { summary: optionalString(formData.get("summary")), status: "DRAFT" },
  });

  revalidatePath("/weekly-report/current");
}

// saveReportPriorityAction — updates the reporting fields (status, result,
// blocker, nextStep, linkedKeyResultId) on an existing planned priority.
export async function saveReportPriorityAction(formData: FormData) {
  const user = await requireUser();
  const priorityId = requiredString(formData.get("priorityId"), "Priority");
  const status = requiredString(formData.get("status"), "Priority status") as PriorityStatus;
  const linkedKeyResultId = optionalString(formData.get("linkedKeyResultId"));

  if (!priorityStatuses.includes(status)) redirect("/weekly-report/current?error=submitted");

  const existing = await prisma.weeklyPriority.findFirst({
    where: { id: priorityId, userId: user.id },
    include: { weeklyReport: { select: { status: true } } },
  });

  if (!existing) redirect("/weekly-report/current?error=submitted");
  if (existing.weeklyReport && existing.weeklyReport.status !== "DRAFT" && existing.weeklyReport.status !== "NEEDS_FOLLOW_UP") {
    redirect("/weekly-report/current?error=submitted");
  }

  if (linkedKeyResultId && linkedKeyResultId !== existing.linkedKeyResultId) {
    const owned = await prisma.keyResult.findFirst({ where: { id: linkedKeyResultId, ownerId: user.id }, select: { id: true } });
    if (!owned) redirect("/weekly-report/current?error=kr-not-assigned");
  }

  await prisma.weeklyPriority.update({
    where: { id: priorityId },
    data: {
      status,
      resultSummary: optionalString(formData.get("resultSummary")),
      blocker: optionalString(formData.get("blocker")),
      nextStep: optionalString(formData.get("nextStep")),
      linkedKeyResultId: existing.type === "KR_LINKED" ? linkedKeyResultId : null,
    },
  });

  revalidatePath("/weekly-report/current");
  revalidatePath("/weekly-report/history");
}

// deleteWeeklyPriorityAction kept for backwards compat (no longer shown in
// the report page; carried-over/plan deletions go through /weekly-plan/actions).
export async function deleteWeeklyPriorityAction(formData: FormData) {
  const user = await requireUser();
  const priorityId = requiredString(formData.get("priorityId"), "Priority");

  await prisma.weeklyPriority.delete({
    where: { id: priorityId, userId: user.id },
  });

  revalidatePath("/weekly-report/current");
}

export async function submitWeeklyReportAction(formData: FormData) {
  const user = await requireUser();
  const weeklyReportId = requiredString(formData.get("weeklyReportId"), "Weekly report");

  const report = await prisma.weeklyReport.findFirst({
    where: { id: weeklyReportId, userId: user.id },
    include: {
      user: { select: { id: true, email: true, name: true, managerId: true, reviewOwnerId: true } },
    },
  });

  if (!report) throw new Error("Weekly report not found.");

  const claimed = await prisma.weeklyReport.updateMany({
    where: { id: report.id, status: { in: ["DRAFT", "NEEDS_FOLLOW_UP"] } },
    data: {
      summary: optionalString(formData.get("summary")) ?? report.summary,
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });

  if (claimed.count === 0) redirect("/weekly-report/current");

  const reviewOwnerId = getEffectiveReviewOwnerId(report.user);
  const reviewOwner = reviewOwnerId
    ? await prisma.user.findUnique({ where: { id: reviewOwnerId }, select: { id: true, email: true, name: true } })
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
      metadata: { weekStart: report.weekStart.toISOString(), reviewOwnerId },
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

  if (!workStatuses.includes(status)) throw new Error("Invalid KR status.");

  const priority = await prisma.weeklyPriority.findFirst({
    where: { id: priorityId, userId: user.id },
    include: {
      weeklyReport: true,
      linkedKeyResult: {
        include: {
          monthlyTargets: true,
          owner: { select: { id: true, email: true, name: true } },
        },
      },
    },
  });

  if (!priority || !priority.linkedKeyResult) redirect("/weekly-report/current?error=kr-required");
  if (!priority.weeklyReportId) redirect("/weekly-report/current?error=no-report");
  if (priority.weeklyReport!.status !== "DRAFT" && priority.weeklyReport!.status !== "NEEDS_FOLLOW_UP") {
    redirect("/weekly-report/current?error=submitted");
  }

  const linkedKeyResult = priority.linkedKeyResult;
  const keyResultId = linkedKeyResult.id;
  const newValue = numberValue(formData.get("newValue"), linkedKeyResult.currentValue);
  const progressPercent = calculateProgressPercent(linkedKeyResult.startValue, newValue, linkedKeyResult.targetValue);
  const confidenceScore = clamp(intValue(formData.get("confidenceScore"), linkedKeyResult.confidenceScore), 1, 5);
  const currentMonthIndex = getCurrentQuarterMonthIndex();
  const currentTarget = linkedKeyResult.monthlyTargets.find((t) => t.monthIndex === currentMonthIndex);
  const pacingStatus = calculatePacingStatus({ progressPercent, currentMonthTargetPercent: currentTarget?.targetPercent });
  const becameBlocked = linkedKeyResult.status !== "ON_HOLD" && status === "ON_HOLD";

  const existingCheckIn = await prisma.checkIn.findFirst({
    where: { weeklyPriorityId: priority.id, userId: user.id },
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
          weeklyReportId: priority.weeklyReportId!,
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
      data: { currentValue: newValue, progressPercent, confidenceScore, status, pacingStatus },
    });

    await recalculateObjectiveAndParents(tx, linkedKeyResult.objectiveId);

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
        metadata: { keyResultId, weeklyReportId: priority.weeklyReportId, newValue, progressPercent, pacingStatus },
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

// ── WeeklyTask CRUD ──────────────────────────────────────────────────────────

export async function createWeeklyTaskAction(formData: FormData) {
  const user = await requireUser();
  const weeklyReportId = requiredString(formData.get("weeklyReportId"), "Weekly report");
  const rawSection = optionalString(formData.get("sectionType")) ?? "";
  const content = requiredString(formData.get("content"), "Task content");

  if (!weeklyTaskSectionTypes.includes(rawSection as WeeklyTaskSectionType)) {
    redirect("/weekly-report/current");
  }
  const sectionType = rawSection as WeeklyTaskSectionType;

  const report = await prisma.weeklyReport.findFirst({
    where: { id: weeklyReportId, userId: user.id },
    select: { status: true },
  });

  if (!report) redirect("/weekly-report/current");
  if (report.status !== "DRAFT" && report.status !== "NEEDS_FOLLOW_UP") {
    redirect("/weekly-report/current?error=submitted");
  }

  const existingCount = await prisma.weeklyTask.count({ where: { weeklyReportId, sectionType } });
  if (existingCount >= 3) redirect("/weekly-report/current?error=task-limit");

  await prisma.weeklyTask.create({
    data: { weeklyReportId, sectionType, content },
  });

  revalidatePath("/weekly-report/current");
}

export async function updateWeeklyTaskAction(formData: FormData) {
  const user = await requireUser();
  const taskId = requiredString(formData.get("taskId"), "Task");

  const task = await prisma.weeklyTask.findFirst({
    where: { id: taskId, weeklyReport: { userId: user.id } },
    include: { weeklyReport: { select: { status: true } } },
  });

  if (!task) redirect("/weekly-report/current");
  if (task.weeklyReport.status !== "DRAFT" && task.weeklyReport.status !== "NEEDS_FOLLOW_UP") {
    redirect("/weekly-report/current?error=submitted");
  }

  const rawStatus = optionalString(formData.get("status")) ?? task.status;
  const status = weeklyTaskStatuses.includes(rawStatus as WeeklyTaskStatus) ? (rawStatus as WeeklyTaskStatus) : task.status;
  const progressPercent = clamp(numberValue(formData.get("progressPercent"), task.progressPercent), 0, 100);

  await prisma.weeklyTask.update({
    where: { id: taskId },
    data: {
      content: optionalString(formData.get("content")) ?? task.content,
      progressPercent,
      status,
      blocker: optionalString(formData.get("blocker")),
    },
  });

  revalidatePath("/weekly-report/current");
}

export async function deleteWeeklyTaskAction(formData: FormData) {
  const user = await requireUser();
  const taskId = requiredString(formData.get("taskId"), "Task");

  await prisma.weeklyTask.deleteMany({
    where: { id: taskId, weeklyReport: { userId: user.id } },
  });

  revalidatePath("/weekly-report/current");
}

// ── KR Update (direct check-in from weekly report, no priority required) ────

export async function saveKrUpdateAction(formData: FormData) {
  const user = await requireUser();
  const weeklyReportId = requiredString(formData.get("weeklyReportId"), "Weekly report");
  const keyResultId = requiredString(formData.get("keyResultId"), "Key result");
  const status = requiredString(formData.get("status"), "Status") as WorkStatus;

  if (!workStatuses.includes(status)) redirect("/weekly-report/current");

  const [report, keyResult] = await Promise.all([
    prisma.weeklyReport.findFirst({
      where: { id: weeklyReportId, userId: user.id },
      select: { status: true },
    }),
    prisma.keyResult.findFirst({
      where: { id: keyResultId, ownerId: user.id },
      include: {
        monthlyTargets: { orderBy: { monthIndex: "asc" } },
        owner: { select: { id: true, email: true, name: true } },
      },
    }),
  ]);

  if (!report || !keyResult) redirect("/weekly-report/current");
  if (report.status !== "DRAFT" && report.status !== "NEEDS_FOLLOW_UP") {
    redirect("/weekly-report/current?error=submitted");
  }

  const newValue = numberValue(formData.get("newValue"), keyResult.currentValue);
  const progressPercent = calculateProgressPercent(keyResult.startValue, newValue, keyResult.targetValue);
  const confidenceScore = clamp(intValue(formData.get("confidenceScore"), keyResult.confidenceScore), 1, 5);
  const currentMonthIndex = getCurrentQuarterMonthIndex();
  const currentTarget = keyResult.monthlyTargets.find((t) => t.monthIndex === currentMonthIndex);
  const pacingStatus = calculatePacingStatus({ progressPercent, currentMonthTargetPercent: currentTarget?.targetPercent ?? null });
  const becameBlocked = keyResult.status !== "ON_HOLD" && status === "ON_HOLD";

  const existingCheckIn = await prisma.checkIn.findFirst({
    where: { keyResultId, weeklyReportId, userId: user.id, weeklyPriorityId: null },
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
          weeklyReportId,
          weeklyPriorityId: null,
          userId: user.id,
          previousValue: keyResult.currentValue,
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
      data: { currentValue: newValue, progressPercent, confidenceScore, status, pacingStatus },
    });

    await recalculateObjectiveAndParents(tx, keyResult.objectiveId);

    if (becameBlocked) {
      await tx.notification.create({
        data: {
          userId: keyResult.ownerId,
          type: "KR_BLOCKED",
          title: "KR blocked",
          body: `${keyResult.title} was marked blocked/on hold.`,
          relatedUrl: `/key-results/${keyResultId}`,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: existingCheckIn ? "UPDATED" : "CREATED",
        entityType: "CheckIn",
        entityId: existingCheckIn?.id ?? keyResultId,
        metadata: { keyResultId, weeklyReportId, newValue, progressPercent, pacingStatus },
      },
    });
  });

  if (becameBlocked) {
    await sendKrBlockedEmail({
      owner: keyResult.owner,
      keyResultTitle: keyResult.title,
      blocker: optionalString(formData.get("blocker")),
      relatedPath: `/key-results/${keyResultId}`,
    });
  }

  revalidatePath("/weekly-report/current");
  revalidatePath("/weekly-report/history");
  revalidatePath(`/key-results/${keyResultId}`);
  revalidatePath(`/objectives/${keyResult.objectiveId}`);
  revalidatePath("/my-okrs");
  revalidatePath("/company-okrs");
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}
