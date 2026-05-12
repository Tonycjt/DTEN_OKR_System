"use server";

import { revalidatePath } from "next/cache";
import { canReviewOwnedReport, getEffectiveReviewOwnerId } from "@/lib/review-routing";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

function requiredString(value: FormDataEntryValue | null, fieldName: string) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

export async function addWeeklyReportCommentAction(formData: FormData) {
  const user = await requireUser();
  const weeklyReportId = requiredString(formData.get("weeklyReportId"), "Weekly report");
  const body = requiredString(formData.get("body"), "Comment");
  const redirectPath = String(formData.get("redirectPath") ?? "/weekly-report/history");

  const report = await prisma.weeklyReport.findUnique({
    where: { id: weeklyReportId },
    include: {
      user: {
        select: {
          id: true,
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

  const canComment = report.userId === user.id || canReviewOwnedReport(user, report.user);

  if (!canComment) {
    throw new Error("You can only comment on reports you own or review.");
  }

  const reviewOwnerId = getEffectiveReviewOwnerId(report.user);
  const notifyUserIds = new Set<string>();

  if (report.userId !== user.id) {
    notifyUserIds.add(report.userId);
  }

  if (reviewOwnerId && reviewOwnerId !== user.id) {
    notifyUserIds.add(reviewOwnerId);
  }

  await prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: {
        weeklyReportId,
        authorId: user.id,
        body,
      },
    });

    if (notifyUserIds.size > 0) {
      await tx.notification.createMany({
        data: Array.from(notifyUserIds).map((userId) => ({
          userId,
          type: "REPORT_COMMENT",
          title: "New report comment",
          body: `${user.name} commented on ${report.user.name}'s weekly report.`,
          relatedUrl: "/weekly-report/history",
        })),
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "CREATED",
        entityType: "Comment",
        entityId: comment.id,
        metadata: {
          weeklyReportId,
          reportOwnerId: report.userId,
        },
      },
    });
  });

  revalidatePath("/reviews/pending");
  revalidatePath("/weekly-report/history");
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  revalidatePath(redirectPath);
}
