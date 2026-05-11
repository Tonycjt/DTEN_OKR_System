"use server";

import { revalidatePath } from "next/cache";
import type { ReviewDecision } from "@prisma/client";
import { requireRole } from "@/server/auth";
import { prisma } from "@/server/prisma";

const reviewerRoles = ["ADMIN", "CEO", "DEPARTMENT_HEAD", "MANAGER"] as const;
const decisions: ReviewDecision[] = ["APPROVED", "NEEDS_FOLLOW_UP", "RISK_FLAGGED"];

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

export async function submitManagerReviewAction(formData: FormData) {
  const manager = await requireRole([...reviewerRoles]);
  const weeklyReportId = requiredString(formData.get("weeklyReportId"), "Weekly report");
  const decision = requiredString(formData.get("decision"), "Decision") as ReviewDecision;

  if (!decisions.includes(decision)) {
    throw new Error("Invalid review decision.");
  }

  const report = await prisma.weeklyReport.findUnique({
    where: { id: weeklyReportId },
    include: {
      user: true,
    },
  });

  if (!report) {
    throw new Error("Weekly report not found.");
  }

  const canReviewAny = manager.role === "ADMIN" || manager.role === "CEO" || manager.role === "DEPARTMENT_HEAD";

  if (!canReviewAny && report.user.managerId !== manager.id) {
    throw new Error("You can only review reports from your direct reports.");
  }

  const nextReportStatus = decision === "APPROVED" ? "REVIEWED" : "NEEDS_FOLLOW_UP";
  const comment = optionalString(formData.get("comment"));

  await prisma.$transaction(async (tx) => {
    await tx.managerReview.create({
      data: {
        weeklyReportId: report.id,
        managerId: manager.id,
        decision,
        comment,
      },
    });

    await tx.weeklyReport.update({
      where: { id: report.id },
      data: {
        status: nextReportStatus,
        reviewedAt: new Date(),
      },
    });

    await tx.notification.create({
      data: {
        userId: report.userId,
        type: decision === "APPROVED" ? "REPORT_REVIEWED" : "FOLLOW_UP_REQUESTED",
        title: decision === "APPROVED" ? "Weekly report reviewed" : "Follow-up requested",
        body: comment ?? `${manager.name} reviewed your weekly report.`,
        relatedUrl: "/weekly-report/history",
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: manager.id,
        action: "REVIEWED",
        entityType: "WeeklyReport",
        entityId: report.id,
        metadata: {
          decision,
          reviewedUserId: report.userId,
        },
      },
    });
  });

  revalidatePath("/reviews/pending");
  revalidatePath("/reviews/history");
  revalidatePath("/weekly-report/history");
  revalidatePath("/notifications");
}
