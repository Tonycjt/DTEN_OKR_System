import type { UserRole } from "@prisma/client";

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
