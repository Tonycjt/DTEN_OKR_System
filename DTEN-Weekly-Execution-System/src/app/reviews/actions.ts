"use server";

import { revalidatePath } from "next/cache";
import type { ReviewDecision } from "@prisma/client";
import { canReviewOwnedReport, getEffectiveReviewOwnerId } from "@/lib/review-routing";
import { requireRole } from "@/server/auth";
import { prisma } from "@/server/prisma";

const reviewerRoles = ["ADMIN", "CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER"] as const;
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
      user: {
        select: {
          id: true,
          managerId: true,
          reviewOwnerId: true,
        },
      },
    },
  });

  if (!report) {
    throw new Error("Weekly report not found.");
  }

  if (!canReviewOwnedReport(manager, report.user)) {
    throw new Error("You can only review reports routed to you.");
  }

  const reviewOwnerId = getEffectiveReviewOwnerId(report.user);
  const escalationOwnerId = decision === "RISK_FLAGGED" ? getEffectiveReviewOwnerId(manager) : null;
  const nextReportStatus = decision === "APPROVED" ? "REVIEWED" : "NEEDS_FOLLOW_UP";
  const comment = optionalString(formData.get("comment"));

  await prisma.$transaction(async (tx) => {
    // Atomically claim the SUBMITTED→reviewed transition.
    // updateMany with the status condition uses Postgres row-level locking:
    // only one concurrent transaction can win; the rest see 0 rows after the
    // winner commits and bail before creating any side-effect records.
    const claimed = await tx.weeklyReport.updateMany({
      where: { id: report.id, status: "SUBMITTED" },
      data: { status: nextReportStatus, reviewedAt: new Date() },
    });

    if (claimed.count === 0) {
      return;
    }

    await tx.managerReview.create({
      data: {
        weeklyReportId: report.id,
        managerId: manager.id,
        decision,
        comment,
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

    if (escalationOwnerId && escalationOwnerId !== manager.id && escalationOwnerId !== report.userId) {
      await tx.notification.create({
        data: {
          userId: escalationOwnerId,
          type: "FOLLOW_UP_REQUESTED",
          title: "Risk escalated",
          body: `${manager.name} flagged a weekly report risk for escalation.`,
          relatedUrl: "/dashboard",
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: manager.id,
        action: "REVIEWED",
        entityType: "WeeklyReport",
        entityId: report.id,
        metadata: {
          decision,
          reviewedUserId: report.userId,
          reviewOwnerId,
          escalationOwnerId,
        },
      },
    });
  });

  revalidatePath("/reviews/pending");
  revalidatePath("/reviews/history");
  revalidatePath("/weekly-report/history");
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}
