import { users, weeklyReports } from "@/mock-data";
import type { User, WeeklyReport } from "@/types";

type WeeklyManagerReviewContext = {
  users?: User[];
  weeklyReports?: WeeklyReport[];
};

export type DirectReportWeeklyReviewSummary = {
  managerUserId: string;
  directReportCount: number;
  totalReports: number;
  needingReviewCount: number;
  reviewedCount: number;
  commentedCount: number;
  needsFollowUpCount: number;
  notReviewedCount: number;
  missingReportCount: number;
  reportsNeedingReview: WeeklyReport[];
  reviewedReports: WeeklyReport[];
};

export function getWeeklyReportsNeedingManagerReview(
  managerUserId: string,
  context: WeeklyManagerReviewContext = {},
): WeeklyReport[] {
  return getDirectReportReports(managerUserId, context).filter((report) =>
    report.managerReviewStatus === "not_reviewed" || report.managerReviewStatus === "needs_follow_up",
  );
}

export function getReviewedWeeklyReports(
  managerUserId: string,
  context: WeeklyManagerReviewContext = {},
): WeeklyReport[] {
  return getDirectReportReports(managerUserId, context).filter((report) =>
    report.managerReviewStatus === "reviewed" ||
    report.managerReviewStatus === "commented" ||
    Boolean(report.reviewedByUserId),
  );
}

export function getDirectReportWeeklyReviewSummary(
  managerUserId: string,
  context: WeeklyManagerReviewContext = {},
): DirectReportWeeklyReviewSummary {
  const directReports = getDirectReportsForManager(managerUserId, context);
  const reports = getDirectReportReports(managerUserId, context);
  const reportsNeedingReview = getWeeklyReportsNeedingManagerReview(managerUserId, context);
  const reviewedReports = getReviewedWeeklyReports(managerUserId, context);

  return {
    managerUserId,
    directReportCount: directReports.length,
    totalReports: reports.length,
    needingReviewCount: reportsNeedingReview.length,
    reviewedCount: reports.filter((report) => report.managerReviewStatus === "reviewed").length,
    commentedCount: reports.filter((report) => report.managerReviewStatus === "commented").length,
    needsFollowUpCount: reports.filter((report) => report.managerReviewStatus === "needs_follow_up").length,
    notReviewedCount: reports.filter((report) => report.managerReviewStatus === "not_reviewed").length,
    missingReportCount: Math.max(0, directReports.length - new Set(reports.map((report) => report.userId)).size),
    reportsNeedingReview,
    reviewedReports,
  };
}

function getDirectReportReports(managerUserId: string, context: WeeklyManagerReviewContext) {
  const directReportIds = new Set(getDirectReportsForManager(managerUserId, context).map((user) => user.id));
  return getReports(context).filter((report) => directReportIds.has(report.userId));
}

function getDirectReportsForManager(managerUserId: string, context: WeeklyManagerReviewContext) {
  return getUsers(context).filter(
    (user) => user.primaryManagerId === managerUserId || user.localManagerId === managerUserId,
  );
}

function getUsers(context: WeeklyManagerReviewContext) {
  return context.users ?? users;
}

function getReports(context: WeeklyManagerReviewContext) {
  return context.weeklyReports ?? weeklyReports;
}
