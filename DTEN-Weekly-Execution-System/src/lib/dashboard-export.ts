import type { PacingStatus, Prisma, UserRole, WorkStatus } from "@prisma/client";
import { formatEnumLabel } from "@/lib/format";
import { reviewOwnerWhere } from "@/lib/review-routing";
import { getKrRiskReasons, krRiskWhere } from "@/lib/risk-detection";
import { getMondayWeekStart } from "@/lib/week";
import { prisma } from "@/server/prisma";

const submittedReportStatuses = new Set(["SUBMITTED", "REVIEWED", "NEEDS_FOLLOW_UP"]);
const workStatuses: WorkStatus[] = ["DRAFT", "ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETED", "ON_HOLD"];
const pacingStatuses: PacingStatus[] = ["NO_TARGET", "NO_UPDATE", "ON_PACE", "BEHIND"];
const confidenceFilters = ["LOW", "MEDIUM", "HIGH"] as const;

type ConfidenceFilter = (typeof confidenceFilters)[number];

export type DashboardExportUser = {
  id: string;
  role: UserRole;
  departmentId: string | null;
};

export type DashboardExportFilters = {
  departmentId?: string;
  teamId?: string;
  ownerId?: string;
  status?: WorkStatus;
  confidence?: ConfidenceFilter;
  pacing?: PacingStatus;
  quarter?: string;
};

export type DashboardCsvRow = {
  section: string;
  type: string;
  name: string;
  owner: string;
  department: string;
  status: string;
  pacing: string;
  confidence: string;
  progress: string;
  details: string;
  url: string;
};

export type WeeklySummaryData = {
  weekStart: Date;
  visibleUserCount: number;
  currentReportCount: number;
  missingReportCount: number;
  reviewableReportCount: number;
  completedReviewCount: number;
  objectiveCount: number;
  keyResultCount: number;
  averageConfidence: number | null;
  riskKrs: Array<{
    id: string;
    title: string;
    ownerName: string;
    objectiveTitle: string;
    status: WorkStatus;
    pacingStatus: PacingStatus;
    confidenceScore: number;
    progressPercent: number;
    reasons: string[];
  }>;
  escalations: Array<{
    id: string;
    employeeName: string;
    managerName: string;
    comment: string | null;
  }>;
  departments: Array<{
    id: string;
    name: string;
    userCount: number;
    keyResultCount: number;
    riskCount: number;
    missingReportCount: number;
  }>;
};

function firstUrlParam(params: URLSearchParams, key: string) {
  const value = params.get(key)?.trim();
  return value ? value : undefined;
}

export function parseDashboardExportFilters(params: URLSearchParams): DashboardExportFilters {
  const status = firstUrlParam(params, "status");
  const confidence = firstUrlParam(params, "confidence");
  const pacing = firstUrlParam(params, "pacing");

  return {
    departmentId: firstUrlParam(params, "departmentId"),
    teamId: firstUrlParam(params, "teamId"),
    ownerId: firstUrlParam(params, "ownerId"),
    quarter: firstUrlParam(params, "quarter"),
    status: status && workStatuses.includes(status as WorkStatus) ? (status as WorkStatus) : undefined,
    confidence: confidence && confidenceFilters.includes(confidence as ConfidenceFilter) ? (confidence as ConfidenceFilter) : undefined,
    pacing: pacing && pacingStatuses.includes(pacing as PacingStatus) ? (pacing as PacingStatus) : undefined,
  };
}

function confidenceWhere(filter?: ConfidenceFilter) {
  if (filter === "LOW") {
    return { confidenceScore: { lte: 2 } };
  }

  if (filter === "MEDIUM") {
    return { confidenceScore: 3 };
  }

  if (filter === "HIGH") {
    return { confidenceScore: { gte: 4 } };
  }

  return {};
}

function andUserWhere(...clauses: Prisma.UserWhereInput[]) {
  const activeClauses = clauses.filter((clause) => Object.keys(clause).length > 0);
  return activeClauses.length <= 1 ? (activeClauses[0] ?? {}) : { AND: activeClauses };
}

function andKeyResultWhere(...clauses: Prisma.KeyResultWhereInput[]) {
  const activeClauses = clauses.filter((clause) => Object.keys(clause).length > 0);
  return activeClauses.length <= 1 ? (activeClauses[0] ?? {}) : { AND: activeClauses };
}

function andObjectiveWhere(...clauses: Prisma.ObjectiveWhereInput[]) {
  const activeClauses = clauses.filter((clause) => Object.keys(clause).length > 0);
  return activeClauses.length <= 1 ? (activeClauses[0] ?? {}) : { AND: activeClauses };
}

function andWeeklyReportWhere(...clauses: Prisma.WeeklyReportWhereInput[]) {
  const activeClauses = clauses.filter((clause) => Object.keys(clause).length > 0);
  return activeClauses.length <= 1 ? (activeClauses[0] ?? {}) : { AND: activeClauses };
}

function noneKeyResultWhere(): Prisma.KeyResultWhereInput {
  return { id: "__no_matching_key_results__" };
}

function noneObjectiveWhere(): Prisma.ObjectiveWhereInput {
  return { id: "__no_matching_objectives__" };
}

function noneWeeklyReportWhere(): Prisma.WeeklyReportWhereInput {
  return { id: "__no_matching_weekly_reports__" };
}

export async function getDashboardExportScope(user: DashboardExportUser, filters: DashboardExportFilters = {}) {
  const isCompanyViewer = user.role === "ADMIN" || user.role === "CEO" || user.role === "EXECUTIVE";
  const isDepartmentViewer = user.role === "DEPARTMENT_HEAD" && Boolean(user.departmentId);
  const isManager = user.role === "MANAGER";
  const baseUserScopeWhere: Prisma.UserWhereInput = {
    isActive: true,
    ...(isCompanyViewer ? {} : isDepartmentViewer ? { departmentId: user.departmentId } : isManager ? reviewOwnerWhere(user.id) : { id: user.id }),
  };
  const filteredUserScopeWhere = andUserWhere(
    baseUserScopeWhere,
    filters.departmentId ? { departmentId: filters.departmentId } : {},
    filters.teamId ? { teamId: filters.teamId } : {},
    filters.ownerId ? { id: filters.ownerId } : {},
  );
  const scopedUsers = await prisma.user.findMany({
    where: filteredUserScopeWhere,
    include: {
      department: true,
      team: true,
    },
    orderBy: { name: "asc" },
  });
  const scopedUserIds = scopedUsers.map((scopedUser) => scopedUser.id);
  const userIdScopeWhere = scopedUserIds.length > 0 ? { ownerId: { in: scopedUserIds } } : noneKeyResultWhere();
  const objectiveUserIdScopeWhere = scopedUserIds.length > 0 ? { ownerId: { in: scopedUserIds } } : noneObjectiveWhere();
  const reportUserScopeWhere = scopedUserIds.length > 0 ? { userId: { in: scopedUserIds } } : noneWeeklyReportWhere();
  const krDimensionFilterWhere: Prisma.KeyResultWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.pacing ? { pacingStatus: filters.pacing } : {}),
    ...confidenceWhere(filters.confidence),
    ...(filters.quarter ? { objective: { quarter: filters.quarter } } : {}),
  };
  const objectiveDimensionFilterWhere: Prisma.ObjectiveWhereInput = {
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.teamId ? { teamId: filters.teamId } : {}),
    ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...confidenceWhere(filters.confidence),
    ...(filters.quarter ? { quarter: filters.quarter } : {}),
  };
  const baseObjectiveScopeWhere: Prisma.ObjectiveWhereInput = isCompanyViewer
    ? {}
    : isDepartmentViewer
      ? { departmentId: user.departmentId }
      : objectiveUserIdScopeWhere;

  return {
    scopedUsers,
    scopedUserIds,
    reportUserScopeWhere,
    krScopeWhere: andKeyResultWhere(userIdScopeWhere, krDimensionFilterWhere),
    objectiveScopeWhere: andObjectiveWhere(baseObjectiveScopeWhere, objectiveDimensionFilterWhere),
  };
}

function csvValue(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function csvConfidence(value: number) {
  return `${value} of 5`;
}

export function rowsToCsv(rows: DashboardCsvRow[]) {
  const headers: Array<keyof DashboardCsvRow> = ["section", "type", "name", "owner", "department", "status", "pacing", "confidence", "progress", "details", "url"];
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(","))].join("\n");
}

export async function buildDashboardCsvRows(user: DashboardExportUser, filters: DashboardExportFilters, baseUrl: string) {
  const scope = await getDashboardExportScope(user, filters);
  const weekStart = getMondayWeekStart();
  const [keyResults, riskKrs, reports, objectives] = await Promise.all([
    prisma.keyResult.findMany({
      where: scope.krScopeWhere,
      include: { owner: { include: { department: true } }, objective: true },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    }),
    prisma.keyResult.findMany({
      where: andKeyResultWhere(scope.krScopeWhere, krRiskWhere),
      include: { owner: { include: { department: true } }, objective: true },
      orderBy: [{ confidenceScore: "asc" }, { updatedAt: "desc" }],
    }),
    prisma.weeklyReport.findMany({
      where: andWeeklyReportWhere(scope.reportUserScopeWhere, { weekStart }),
      include: { user: { include: { department: true } }, priorities: true },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    }),
    prisma.objective.findMany({
      where: scope.objectiveScopeWhere,
      include: { owner: true, department: true },
      orderBy: [{ level: "asc" }, { updatedAt: "desc" }],
    }),
  ]);

  return [
    ...objectives.map((objective) => ({
      section: "Objectives",
      type: formatEnumLabel(objective.level),
      name: objective.title,
      owner: objective.owner.name,
      department: objective.department?.name ?? "",
      status: formatEnumLabel(objective.status),
      pacing: "",
      confidence: csvConfidence(objective.confidenceScore),
      progress: `${Math.round(objective.progressPercent)}%`,
      details: objective.quarter,
      url: new URL(`/objectives/${objective.id}`, baseUrl).toString(),
    })),
    ...keyResults.map((kr) => ({
      section: "Key Results",
      type: "Key Result",
      name: kr.title,
      owner: kr.owner.name,
      department: kr.owner.department?.name ?? "",
      status: formatEnumLabel(kr.status),
      pacing: formatEnumLabel(kr.pacingStatus),
      confidence: csvConfidence(kr.confidenceScore),
      progress: `${Math.round(kr.progressPercent)}%`,
      details: kr.objective.title,
      url: new URL(`/key-results/${kr.id}`, baseUrl).toString(),
    })),
    ...riskKrs.map((kr) => ({
      section: "Risk Items",
      type: "Key Result",
      name: kr.title,
      owner: kr.owner.name,
      department: kr.owner.department?.name ?? "",
      status: formatEnumLabel(kr.status),
      pacing: formatEnumLabel(kr.pacingStatus),
      confidence: csvConfidence(kr.confidenceScore),
      progress: `${Math.round(kr.progressPercent)}%`,
      details: getKrRiskReasons(kr).join("; "),
      url: new URL(`/key-results/${kr.id}`, baseUrl).toString(),
    })),
    ...reports.map((report) => ({
      section: "Weekly Reports",
      type: "Current Week",
      name: report.user.name,
      owner: report.user.name,
      department: report.user.department?.name ?? "",
      status: formatEnumLabel(report.status),
      pacing: "",
      confidence: "",
      progress: "",
      details: report.summary ?? `${report.priorities.length} priorities`,
      url: new URL(report.userId === user.id ? "/weekly-report/history" : "/reviews/pending", baseUrl).toString(),
    })),
  ];
}

export async function buildWeeklySummaryData(user: DashboardExportUser): Promise<WeeklySummaryData> {
  const weekStart = getMondayWeekStart();
  const scope = await getDashboardExportScope(user);
  const [reportsThisWeek, objectiveCount, keyResults, riskKrs, escalations] = await Promise.all([
    prisma.weeklyReport.findMany({
      where: andWeeklyReportWhere(scope.reportUserScopeWhere, { weekStart }),
      include: { user: { include: { department: true } } },
    }),
    prisma.objective.count({ where: scope.objectiveScopeWhere }),
    prisma.keyResult.findMany({
      where: scope.krScopeWhere,
      include: { owner: { include: { department: true } }, objective: true },
    }),
    prisma.keyResult.findMany({
      where: andKeyResultWhere(scope.krScopeWhere, krRiskWhere),
      include: { owner: true, objective: true },
      orderBy: [{ confidenceScore: "asc" }, { updatedAt: "desc" }],
      take: 8,
    }),
    prisma.managerReview.findMany({
      where: {
        decision: "RISK_FLAGGED",
        weeklyReport: scope.reportUserScopeWhere,
      },
      include: { manager: true, weeklyReport: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);
  const reportsByUserId = new Map(reportsThisWeek.map((report) => [report.userId, report]));
  const missingReportCount = scope.scopedUsers.filter((scopedUser) => {
    const report = reportsByUserId.get(scopedUser.id);
    return !report || !submittedReportStatuses.has(report.status);
  }).length;
  const reviewableReportCount = reportsThisWeek.filter((report) => submittedReportStatuses.has(report.status)).length;
  const completedReviewCount = reportsThisWeek.filter((report) => report.status === "REVIEWED" || report.status === "NEEDS_FOLLOW_UP").length;
  const confidenceSum = keyResults.reduce((sum, kr) => sum + kr.confidenceScore, 0);
  const departmentMap = new Map<string, WeeklySummaryData["departments"][number]>();

  for (const scopedUser of scope.scopedUsers) {
    const departmentId = scopedUser.departmentId ?? "unassigned";
    const existing = departmentMap.get(departmentId) ?? {
      id: departmentId,
      name: scopedUser.department?.name ?? "Unassigned",
      userCount: 0,
      keyResultCount: 0,
      riskCount: 0,
      missingReportCount: 0,
    };
    existing.userCount += 1;
    const report = reportsByUserId.get(scopedUser.id);
    if (!report || !submittedReportStatuses.has(report.status)) {
      existing.missingReportCount += 1;
    }
    departmentMap.set(departmentId, existing);
  }

  for (const kr of keyResults) {
    const departmentId = kr.owner.departmentId ?? "unassigned";
    const existing = departmentMap.get(departmentId);
    if (existing) {
      existing.keyResultCount += 1;
      if (getKrRiskReasons(kr).length > 0) {
        existing.riskCount += 1;
      }
    }
  }

  return {
    weekStart,
    visibleUserCount: scope.scopedUsers.length,
    currentReportCount: reportsThisWeek.length,
    missingReportCount,
    reviewableReportCount,
    completedReviewCount,
    objectiveCount,
    keyResultCount: keyResults.length,
    averageConfidence: keyResults.length === 0 ? null : confidenceSum / keyResults.length,
    riskKrs: riskKrs.map((kr) => ({
      id: kr.id,
      title: kr.title,
      ownerName: kr.owner.name,
      objectiveTitle: kr.objective.title,
      status: kr.status,
      pacingStatus: kr.pacingStatus,
      confidenceScore: kr.confidenceScore,
      progressPercent: kr.progressPercent,
      reasons: getKrRiskReasons(kr),
    })),
    escalations: escalations.map((review) => ({
      id: review.id,
      employeeName: review.weeklyReport.user.name,
      managerName: review.manager.name,
      comment: review.comment,
    })),
    departments: Array.from(departmentMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
  };
}
