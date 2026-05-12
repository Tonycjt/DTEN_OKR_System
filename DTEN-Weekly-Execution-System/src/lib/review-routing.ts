import type { Prisma, UserRole } from "@prisma/client";

export type ReviewSubject = {
  id: string;
  managerId: string | null;
  reviewOwnerId: string | null;
};

export type ReviewViewer = {
  id: string;
  role: UserRole;
};

export function getEffectiveReviewOwnerId(user: ReviewSubject) {
  return user.reviewOwnerId ?? user.managerId ?? null;
}

export function isReviewOwner(reviewerId: string, user: ReviewSubject) {
  return getEffectiveReviewOwnerId(user) === reviewerId;
}

export function canReviewOwnedReport(reviewer: ReviewViewer, reportOwner: ReviewSubject) {
  if (reviewer.role === "ADMIN") {
    return true;
  }

  return isReviewOwner(reviewer.id, reportOwner);
}

export function reviewOwnerWhere(reviewerId: string): Prisma.UserWhereInput {
  return {
    OR: [{ reviewOwnerId: reviewerId }, { reviewOwnerId: null, managerId: reviewerId }],
  };
}

export function reviewQueueWhere(reviewerId: string): Prisma.WeeklyReportWhereInput {
  return {
    user: reviewOwnerWhere(reviewerId),
  };
}
