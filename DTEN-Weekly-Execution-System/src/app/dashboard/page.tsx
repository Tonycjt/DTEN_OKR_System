import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { FollowUpStatus, PacingStatus, Prisma, UserRole, WorkStatus } from "@prisma/client";
import { updateFollowUpStatusAction } from "@/app/follow-ups/actions";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatCard } from "@/components/ui/stat-card";
import { pacingStatusTone, weeklyReportStatusTone, workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { calculateObjectiveHealth, getObjectiveChildStatuses } from "@/lib/objective-health";
import { reviewOwnerWhere, reviewQueueWhere } from "@/lib/review-routing";
import { formatReviewCompletionRate, getKrRiskReasons, krRiskWhere } from "@/lib/risk-detection";
import { formatShortDate, getMondayWeekStart, getSundayWeekEnd } from "@/lib/week";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

const submittedReportStatuses = ["SUBMITTED", "REVIEWED", "NEEDS_FOLLOW_UP"] as const;
const followUpStatuses: FollowUpStatus[] = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"];
const workStatuses: WorkStatus[] = ["DRAFT", "ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETED", "ON_HOLD"];
const pacingStatuses: PacingStatus[] = ["NO_TARGET", "NO_UPDATE", "ON_PACE", "BEHIND"];
const confidenceFilters = ["LOW", "MEDIUM", "HIGH"] as const;

type ConfidenceFilter = (typeof confidenceFilters)[number];
type DashboardSearchParams = Record<string, string | string[] | undefined>;
type DashboardPageProps = {
  searchParams?: Promise<DashboardSearchParams>;
};

type DashboardFilters = {
  departmentId?: string;
  teamId?: string;
  ownerId?: string;
  status?: WorkStatus;
  confidence?: ConfidenceFilter;
  pacing?: PacingStatus;
  quarter?: string;
};

function averageConfidence(value: number | null | undefined) {
  return value == null ? "n/a" : `${value.toFixed(1)}/5`;
}

function compactCounts<T extends string>(counts: Map<T, number>, emptyLabel = "none") {
  const entries = Array.from(counts.entries()).filter(([, count]) => count > 0);

  if (entries.length === 0) {
    return emptyLabel;
  }

  return entries.map(([label, count]) => `${formatEnumLabel(label)} ${count}`).join(" / ");
}

function firstSearchParam(params: DashboardSearchParams, key: string) {
  const value = params[key];
  const firstValue = Array.isArray(value) ? value[0] : value;
  const text = firstValue?.trim();
  return text ? text : undefined;
}

function parseDashboardFilters(params: DashboardSearchParams): DashboardFilters {
  const status = firstSearchParam(params, "status");
  const confidence = firstSearchParam(params, "confidence");
  const pacing = firstSearchParam(params, "pacing");

  return {
    departmentId: firstSearchParam(params, "departmentId"),
    teamId: firstSearchParam(params, "teamId"),
    ownerId: firstSearchParam(params, "ownerId"),
    quarter: firstSearchParam(params, "quarter"),
    status: status && workStatuses.includes(status as WorkStatus) ? (status as WorkStatus) : undefined,
    confidence: confidence && confidenceFilters.includes(confidence as ConfidenceFilter) ? (confidence as ConfidenceFilter) : undefined,
    pacing: pacing && pacingStatuses.includes(pacing as PacingStatus) ? (pacing as PacingStatus) : undefined,
  };
}

function activeFilterCount(filters: DashboardFilters) {
  return Object.values(filters).filter(Boolean).length;
}

function dashboardFilterSearch(filters: DashboardFilters) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function confidenceFilterLabel(filter: ConfidenceFilter) {
  if (filter === "LOW") {
    return "Low (1-2)";
  }

  if (filter === "MEDIUM") {
    return "Medium (3)";
  }

  return "High (4-5)";
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
  if (activeClauses.length === 0) {
    return {};
  }

  return activeClauses.length === 1 ? activeClauses[0] : { AND: activeClauses };
}

function andKeyResultWhere(...clauses: Prisma.KeyResultWhereInput[]) {
  const activeClauses = clauses.filter((clause) => Object.keys(clause).length > 0);
  if (activeClauses.length === 0) {
    return {};
  }

  return activeClauses.length === 1 ? activeClauses[0] : { AND: activeClauses };
}

function andObjectiveWhere(...clauses: Prisma.ObjectiveWhereInput[]) {
  const activeClauses = clauses.filter((clause) => Object.keys(clause).length > 0);
  if (activeClauses.length === 0) {
    return {};
  }

  return activeClauses.length === 1 ? activeClauses[0] : { AND: activeClauses };
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

function noneManagerReviewWhere(): Prisma.ManagerReviewWhereInput {
  return { id: "__no_matching_manager_reviews__" };
}

function andWeeklyReportWhere(...clauses: Prisma.WeeklyReportWhereInput[]) {
  const activeClauses = clauses.filter((clause) => Object.keys(clause).length > 0);
  if (activeClauses.length === 0) {
    return {};
  }

  return activeClauses.length === 1 ? activeClauses[0] : { AND: activeClauses };
}

function andManagerReviewWhere(...clauses: Prisma.ManagerReviewWhereInput[]) {
  const activeClauses = clauses.filter((clause) => Object.keys(clause).length > 0);
  if (activeClauses.length === 0) {
    return {};
  }

  return activeClauses.length === 1 ? activeClauses[0] : { AND: activeClauses };
}

function followUpStatusTone(status: FollowUpStatus) {
  if (status === "DONE") {
    return "success";
  }

  if (status === "IN_PROGRESS") {
    return "info";
  }

  if (status === "CANCELLED") {
    return "neutral";
  }

  return "warning";
}

function roleDashboardLabel(role: UserRole) {
  if (role === "CEO" || role === "ADMIN" || role === "EXECUTIVE") {
    return "Company command view";
  }

  if (role === "DEPARTMENT_HEAD") {
    return "Department execution view";
  }

  if (role === "MANAGER") {
    return "Manager review view";
  }

  return "Employee execution view";
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requireUser();
  const filters = parseDashboardFilters((await searchParams) ?? {});
  const filtersActiveCount = activeFilterCount(filters);
  const filterSearch = dashboardFilterSearch(filters);
  const weekStart = getMondayWeekStart();
  const weekEnd = getSundayWeekEnd(weekStart);
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

  const [currentReport, assignedKrs, followUpReports, assignedFollowUps, createdFollowUps, unreadNotifications, filterOptionUsers, scopedUsers] = await Promise.all([
    prisma.weeklyReport.findFirst({
      where: {
        userId: user.id,
        weekStart,
      },
      include: {
        weeklyTasks: { select: { id: true } },
        reviews: {
          orderBy: { createdAt: "desc" },
          include: { manager: true },
        },
      },
    }),
    prisma.keyResult.findMany({
      where: { ownerId: user.id },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 6,
      include: {
        objective: true,
      },
    }),
    prisma.weeklyReport.findMany({
      where: {
        userId: user.id,
        status: "NEEDS_FOLLOW_UP",
      },
      orderBy: { reviewedAt: "desc" },
      take: 3,
      include: {
        reviews: {
          orderBy: { createdAt: "desc" },
          include: { manager: true },
        },
      },
    }),
    prisma.followUp.findMany({
      where: {
        ownerId: user.id,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 6,
      include: {
        assignedBy: true,
      },
    }),
    prisma.followUp.findMany({
      where: {
        assignedById: user.id,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 6,
      include: {
        owner: true,
      },
    }),
    prisma.notification.count({
      where: {
        userId: user.id,
        readAt: null,
      },
    }),
    prisma.user.findMany({
      where: baseUserScopeWhere,
      orderBy: { name: "asc" },
      include: {
        department: true,
        team: true,
      },
    }),
    prisma.user.findMany({
      where: filteredUserScopeWhere,
      orderBy: { name: "asc" },
      include: {
        department: true,
        team: true,
      },
    }),
  ]);

  const filterDepartments = Array.from(
    filterOptionUsers
      .reduce((departments, optionUser) => {
        if (optionUser.department) {
          departments.set(optionUser.department.id, optionUser.department.name);
        }

        return departments;
      }, new Map<string, string>())
      .entries(),
  )
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const filterTeams = Array.from(
    filterOptionUsers
      .reduce((teams, optionUser) => {
        if (optionUser.team && (!filters.departmentId || optionUser.team.departmentId === filters.departmentId)) {
          teams.set(optionUser.team.id, optionUser.team.name);
        }

        return teams;
      }, new Map<string, string>())
      .entries(),
  )
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const scopedUserIds = scopedUsers.map((scopedUser) => scopedUser.id);
  const baseScopedUserIds = filterOptionUsers.map((optionUser) => optionUser.id);
  const userIdScopeWhere = scopedUserIds.length > 0 ? { ownerId: { in: scopedUserIds } } : noneKeyResultWhere();
  const objectiveUserIdScopeWhere = scopedUserIds.length > 0 ? { ownerId: { in: scopedUserIds } } : noneObjectiveWhere();
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
      : baseScopedUserIds.length > 0
        ? { ownerId: { in: baseScopedUserIds } }
        : noneObjectiveWhere();
  const krScopeWhere = andKeyResultWhere(userIdScopeWhere, krDimensionFilterWhere);
  const objectiveScopeWhere = andObjectiveWhere(
    isCompanyViewer || isDepartmentViewer ? baseObjectiveScopeWhere : objectiveUserIdScopeWhere,
    objectiveDimensionFilterWhere,
  );
  const reportUserScopeWhere: Prisma.WeeklyReportWhereInput = scopedUserIds.length > 0 ? { userId: { in: scopedUserIds } } : noneWeeklyReportWhere();
  const pendingReviewScopeWhere = andWeeklyReportWhere(reportUserScopeWhere, isManager ? reviewQueueWhere(user.id) : {});
  const managerReviewUserScopeWhere: Prisma.ManagerReviewWhereInput =
    scopedUserIds.length > 0 ? { weeklyReport: { userId: { in: scopedUserIds } } } : noneManagerReviewWhere();
  const escalatedReviewBaseScopeWhere: Prisma.ManagerReviewWhereInput = isCompanyViewer
    ? {}
    : isDepartmentViewer
      ? { weeklyReport: { user: { departmentId: user.departmentId } } }
      : isManager
        ? {
            OR: [{ manager: reviewOwnerWhere(user.id) }, { weeklyReport: { user: reviewOwnerWhere(user.id) } }],
          }
        : { weeklyReport: { userId: user.id } };
  const escalatedReviewScopeWhere = andManagerReviewWhere(managerReviewUserScopeWhere, escalatedReviewBaseScopeWhere);

  const [
    reportsThisWeek,
    pendingReviews,
    pendingReviewReports,
    totalObjectives,
    totalKrs,
    krStatusGroups,
    krPacingGroups,
    confidenceAggregate,
    riskKrs,
    escalatedReviews,
    filterQuarters,
    departmentsForHealth,
    departmentPendingReports,
    departmentEscalatedReviews,
    recentAuditLogs,
    objectivesForHealth,
  ] = await Promise.all([
    prisma.weeklyReport.findMany({
      where: andWeeklyReportWhere(reportUserScopeWhere, { weekStart }),
      include: {
        user: true,
      },
    }),
    user.role === "EMPLOYEE"
      ? Promise.resolve(0)
      : prisma.weeklyReport.count({
          where: andWeeklyReportWhere(pendingReviewScopeWhere, { status: "SUBMITTED" }),
        }),
    prisma.weeklyReport.findMany({
      where: andWeeklyReportWhere(pendingReviewScopeWhere, { status: "SUBMITTED" }),
      orderBy: [{ submittedAt: "asc" }, { updatedAt: "asc" }],
      take: 8,
      include: {
        user: {
          include: {
            department: true,
            team: true,
            manager: true,
            reviewOwner: true,
          },
        },
      },
    }),
    prisma.objective.count({ where: objectiveScopeWhere }),
    prisma.keyResult.count({ where: krScopeWhere }),
    prisma.keyResult.groupBy({
      by: ["status"],
      where: krScopeWhere,
      _count: true,
    }),
    prisma.keyResult.groupBy({
      by: ["pacingStatus"],
      where: krScopeWhere,
      _count: true,
    }),
    prisma.keyResult.aggregate({
      where: krScopeWhere,
      _avg: {
        confidenceScore: true,
      },
    }),
    prisma.keyResult.findMany({
      where: andKeyResultWhere(krScopeWhere, krRiskWhere),
      orderBy: [{ confidenceScore: "asc" }, { updatedAt: "desc" }],
      take: 8,
      include: {
        owner: true,
        objective: true,
      },
    }),
    prisma.managerReview.findMany({
      where: andManagerReviewWhere(escalatedReviewScopeWhere, { decision: "RISK_FLAGGED" }),
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        manager: true,
        weeklyReport: {
          include: {
            user: {
              include: {
                department: true,
                team: true,
              },
            },
          },
        },
      },
    }),
    prisma.objective.findMany({
      where: baseObjectiveScopeWhere,
      select: {
        quarter: true,
      },
      orderBy: {
        quarter: "desc",
      },
    }),
    isCompanyViewer
      ? prisma.department.findMany({
          where: filters.departmentId ? { id: filters.departmentId } : {},
          orderBy: { name: "asc" },
          include: {
            users: {
              where: filteredUserScopeWhere,
              include: {
                weeklyReports: {
                  where: { weekStart },
                  include: { reviews: true },
                },
                ownedKeyResults: {
                  where: krDimensionFilterWhere,
                },
              },
            },
            objectives: {
              where: objectiveDimensionFilterWhere,
            },
          },
        })
      : Promise.resolve([]),
    isCompanyViewer
      ? prisma.weeklyReport.findMany({
          where: andWeeklyReportWhere(reportUserScopeWhere, { status: "SUBMITTED" }),
          include: {
            user: {
              select: {
                departmentId: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    isCompanyViewer
      ? prisma.managerReview.findMany({
          where: andManagerReviewWhere(managerReviewUserScopeWhere, { decision: "RISK_FLAGGED" }),
          include: {
            weeklyReport: {
              include: {
                user: {
                  select: {
                    departmentId: true,
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    isCompanyViewer
      ? prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { actor: true },
        })
      : Promise.resolve([]),
    prisma.objective.findMany({
      where: andObjectiveWhere(objectiveScopeWhere, { status: { not: "COMPLETED" } }),
      orderBy: [{ level: "asc" }, { title: "asc" }],
      take: 20,
      include: {
        owner: true,
        keyResults: { select: { id: true, status: true } },
      },
    }),
  ]);

  const reportsByUserId = new Map(reportsThisWeek.map((report) => [report.userId, report]));
  const missingReportUsers = scopedUsers.filter((scopedUser) => {
    const report = reportsByUserId.get(scopedUser.id);
    return !report || !submittedReportStatuses.includes(report.status as (typeof submittedReportStatuses)[number]);
  });
  const reviewableReports = reportsThisWeek.filter((report) => submittedReportStatuses.includes(report.status as (typeof submittedReportStatuses)[number]));
  const completedReviews = reviewableReports.filter((report) => report.status === "REVIEWED" || report.status === "NEEDS_FOLLOW_UP");
  const pendingReviewsByOwner = Array.from(
    pendingReviewReports
      .reduce((groups, report) => {
        const label = report.user.reviewOwner?.name ?? report.user.manager?.name ?? "Unassigned reviewer";
        groups.set(label, (groups.get(label) ?? 0) + 1);
        return groups;
      }, new Map<string, number>())
      .entries(),
  ).map(([label, count]) => ({ label, count }));
  const departmentPendingCounts = departmentPendingReports.reduce((counts, report) => {
    const departmentId = report.user.departmentId ?? "unassigned";
    counts.set(departmentId, (counts.get(departmentId) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const departmentEscalationCounts = departmentEscalatedReviews.reduce((counts, review) => {
    const departmentId = review.weeklyReport.user.departmentId ?? "unassigned";
    counts.set(departmentId, (counts.get(departmentId) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const departmentHealthRows = departmentsForHealth.map((department) => {
    const keyResults = department.users.flatMap((departmentUser) => departmentUser.ownedKeyResults);
    const currentReports = department.users.flatMap((departmentUser) => departmentUser.weeklyReports);
    const submittedReports = currentReports.filter((report) => submittedReportStatuses.includes(report.status as (typeof submittedReportStatuses)[number]));
    const completedDepartmentReviews = currentReports.filter((report) => report.status === "REVIEWED" || report.status === "NEEDS_FOLLOW_UP");
    const missingReports = department.users.filter((departmentUser) => {
      const report = departmentUser.weeklyReports[0];
      return !report || !submittedReportStatuses.includes(report.status as (typeof submittedReportStatuses)[number]);
    }).length;
    const confidenceSum = keyResults.reduce((sum, kr) => sum + kr.confidenceScore, 0);
    const statusCounts = keyResults.reduce((counts, kr) => {
      counts.set(kr.status, (counts.get(kr.status) ?? 0) + 1);
      return counts;
    }, new Map<(typeof keyResults)[number]["status"], number>());
    const pacingCounts = keyResults.reduce((counts, kr) => {
      counts.set(kr.pacingStatus, (counts.get(kr.pacingStatus) ?? 0) + 1);
      return counts;
    }, new Map<(typeof keyResults)[number]["pacingStatus"], number>());
    const riskCount = keyResults.filter((kr) => getKrRiskReasons(kr).length > 0).length;

    return {
      id: department.id,
      name: department.name,
      objectiveCount: department.objectives.length,
      keyResultCount: keyResults.length,
      statusSummary: compactCounts(statusCounts),
      pacingSummary: compactCounts(pacingCounts),
      averageConfidence: keyResults.length === 0 ? null : confidenceSum / keyResults.length,
      missingReports,
      pendingReviews: departmentPendingCounts.get(department.id) ?? 0,
      escalations: departmentEscalationCounts.get(department.id) ?? 0,
      reviewCompletion: formatReviewCompletionRate(completedDepartmentReviews.length, submittedReports.length),
      riskCount,
    };
  });
  const filterQuarterOptions = Array.from(new Set(filterQuarters.map((objective) => objective.quarter))).sort().reverse();
  const atRiskObjectives = objectivesForHealth
    .map((objective) => {
      const childStatuses = getObjectiveChildStatuses(objective);
      const health = calculateObjectiveHealth(childStatuses);
      return { ...objective, health, childCount: childStatuses.length };
    })
    .filter((objective) => objective.health.computedStatus === "AT_RISK" || objective.health.computedStatus === "OFF_TRACK");

  return (
    <div className="stack">
      <PageHeader
        title={`Welcome, ${user.name}`}
        description={`${roleDashboardLabel(user.role)} for ${formatShortDate(weekStart)} to ${formatShortDate(weekEnd)}.`}
        actions={
          <span className="table-actions">
            <LinkButton href="/weekly-report/current">
              Open Weekly Report
              <ArrowRight size={16} aria-hidden="true" />
            </LinkButton>
            <LinkButton href={`/dashboard/export${filterSearch}`} tone="secondary">
              Export CSV
            </LinkButton>
            {user.role === "EMPLOYEE" ? null : (
              <LinkButton href="/executive-summary" tone="secondary">
                Summary
              </LinkButton>
            )}
          </span>
        }
      />

      <Card>
        <CardHeader>
          <h2>Dashboard Filters</h2>
          <p>Refine visible OKR health without changing your role-based access scope.</p>
        </CardHeader>
        <CardContent>
          <form className="dashboard-filter-form" method="get">
            <label className="field">
              <span>Department</span>
              <select defaultValue={filters.departmentId ?? ""} name="departmentId">
                <option value="">All visible departments</option>
                {filterDepartments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Team</span>
              <select defaultValue={filters.teamId ?? ""} name="teamId">
                <option value="">All visible teams</option>
                {filterTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Owner</span>
              <select defaultValue={filters.ownerId ?? ""} name="ownerId">
                <option value="">All visible owners</option>
                {filterOptionUsers.map((optionUser) => (
                  <option key={optionUser.id} value={optionUser.id}>
                    {optionUser.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select defaultValue={filters.status ?? ""} name="status">
                <option value="">All statuses</option>
                {workStatuses.map((status) => (
                  <option key={status} value={status}>
                    {formatEnumLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Confidence</span>
              <select defaultValue={filters.confidence ?? ""} name="confidence">
                <option value="">All confidence levels</option>
                {confidenceFilters.map((confidence) => (
                  <option key={confidence} value={confidence}>
                    {confidenceFilterLabel(confidence)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Pacing</span>
              <select defaultValue={filters.pacing ?? ""} name="pacing">
                <option value="">All pacing states</option>
                {pacingStatuses.map((pacing) => (
                  <option key={pacing} value={pacing}>
                    {formatEnumLabel(pacing)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Quarter</span>
              <select defaultValue={filters.quarter ?? ""} name="quarter">
                <option value="">All quarters</option>
                {filterQuarterOptions.map((quarter) => (
                  <option key={quarter} value={quarter}>
                    {quarter}
                  </option>
                ))}
              </select>
            </label>
            <div className="dashboard-filter-actions">
              <Button type="submit">Apply Filters</Button>
              <LinkButton href="/dashboard" tone="secondary">
                Reset
              </LinkButton>
              <Badge tone={filtersActiveCount > 0 ? "info" : "neutral"}>{filtersActiveCount} active</Badge>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-3">
        <StatCard
          label="Current Report"
          value={currentReport ? formatEnumLabel(currentReport.status) : "Not Started"}
          detail={currentReport ? `${currentReport.weeklyTasks.length} task${currentReport.weeklyTasks.length !== 1 ? "s" : ""}` : "create this week"}
          tone={currentReport?.status === "NEEDS_FOLLOW_UP" ? "warning" : currentReport ? "success" : "info"}
        />
        <StatCard label="Assigned KRs" value={String(assignedKrs.length)} detail="owned by you" tone="info" />
        <StatCard
          label="Unread Notifications"
          value={String(unreadNotifications)}
          detail={unreadNotifications > 0 ? "needs attention" : "clear"}
          tone={unreadNotifications > 0 ? "warning" : "success"}
        />
      </div>

      <div className="grid grid-2">
        <Card>
          <CardHeader>
            <h2>Assigned Follow-ups</h2>
            <p>Open action items assigned to you from reviews, reports, and KRs.</p>
          </CardHeader>
          <CardContent>
            <div className="route-grid">
              {assignedFollowUps.map((followUp) => (
                <div className="route-item" key={followUp.id}>
                  <span>
                    <strong>{followUp.content}</strong>
                    <br />
                    <span className="muted">
                      From {followUp.assignedBy.name}
                      {followUp.dueDate ? ` / Due ${formatShortDate(followUp.dueDate)}` : ""}
                    </span>
                  </span>
                  <form action={updateFollowUpStatusAction} className="table-actions">
                    <input name="followUpId" type="hidden" value={followUp.id} />
                    <input name="redirectPath" type="hidden" value="/dashboard" />
                    <select className="inline-select" defaultValue={followUp.status} name="status">
                      {followUpStatuses.map((status) => (
                        <option key={status} value={status}>
                          {formatEnumLabel(status)}
                        </option>
                      ))}
                    </select>
                    <Button tone="secondary" type="submit">
                      Save
                    </Button>
                  </form>
                </div>
              ))}
              {assignedFollowUps.length === 0 ? <div className="route-item">No open follow-ups are assigned to you.</div> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2>Created Follow-ups</h2>
            <p>Open follow-ups you assigned to others.</p>
          </CardHeader>
          <CardContent>
            <div className="route-grid">
              {createdFollowUps.map((followUp) => (
                <div className="route-item" key={followUp.id}>
                  <span>
                    <strong>{followUp.content}</strong>
                    <br />
                    <span className="muted">
                      Owner: {followUp.owner.name}
                      {followUp.dueDate ? ` / Due ${formatShortDate(followUp.dueDate)}` : ""}
                    </span>
                  </span>
                  <Badge tone={followUpStatusTone(followUp.status)}>{formatEnumLabel(followUp.status)}</Badge>
                </div>
              ))}
              {createdFollowUps.length === 0 ? <div className="route-item">No open follow-ups created by you.</div> : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-3">
        <StatCard label="Objectives" value={String(totalObjectives)} detail="visible scope" tone="info" />
        <StatCard label="Key Results" value={String(totalKrs)} detail="visible scope" tone="success" />
        <StatCard label="Pending Reviews" value={String(pendingReviews)} detail="submitted reports" tone="warning" />
      </div>

      <div className="grid grid-3">
        <StatCard
          label="Review Completion"
          value={formatReviewCompletionRate(completedReviews.length, reviewableReports.length)}
          detail={`${completedReviews.length} of ${reviewableReports.length} reviewable reports`}
          tone={reviewableReports.length === 0 || completedReviews.length === reviewableReports.length ? "success" : "warning"}
        />
        <StatCard label="Escalated Reviews" value={String(escalatedReviews.length)} detail="risk flagged" tone={escalatedReviews.length > 0 ? "danger" : "success"} />
        <StatCard label="Missing Updates" value={String(missingReportUsers.length)} detail="current week" tone={missingReportUsers.length > 0 ? "warning" : "success"} />
      </div>

      <div className="grid grid-2">
        <Card>
          <CardHeader>
            <h2>My Execution</h2>
            <p>Current report state, assigned KRs, and manager follow-ups for this week.</p>
          </CardHeader>
          <CardContent>
            <div className="route-grid">
              {currentReport ? (
                <div className="route-item">
                  <span>
                    <strong>Weekly report</strong>
                    <br />
                    <span className="muted">{currentReport.summary ?? "No summary saved yet."}</span>
                  </span>
                  <Badge tone={weeklyReportStatusTone(currentReport.status)}>{formatEnumLabel(currentReport.status)}</Badge>
                </div>
              ) : (
                <div className="route-item">
                  <span>No current weekly report exists yet.</span>
                  <Link href="/weekly-report/current">Create report</Link>
                </div>
              )}

              {assignedKrs.map((kr) => (
                <div className="route-item" key={kr.id}>
                  <span>
                    <Link href={`/key-results/${kr.id}`}>
                      <strong>{kr.title}</strong>
                    </Link>
                    <br />
                    <span className="muted">
                      {kr.objective.title} / {kr.currentValue} of {kr.targetValue} / Confidence {kr.confidenceScore}/5
                    </span>
                    <ProgressBar value={kr.progressPercent} />
                  </span>
                  <span className="table-actions">
                    <Badge tone={workStatusTone(kr.status)}>{formatEnumLabel(kr.status)}</Badge>
                    <Badge tone={pacingStatusTone(kr.pacingStatus)}>{formatEnumLabel(kr.pacingStatus)}</Badge>
                  </span>
                </div>
              ))}
              {assignedKrs.length === 0 ? <div className="route-item">No KRs are assigned to you yet.</div> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2>Follow-ups</h2>
            <p>Manager requests and reviewed reports that need another pass.</p>
          </CardHeader>
          <CardContent>
            <div className="route-grid">
              {followUpReports.map((report) => {
                const latestReview = report.reviews[0];

                return (
                  <div className="route-item" key={report.id}>
                    <span>
                      <strong>{formatShortDate(report.weekStart)}</strong>
                      <br />
                      <span className="muted">
                        {latestReview?.manager.name ?? "Manager"}: {latestReview?.comment ?? "Follow-up requested"}
                      </span>
                    </span>
                    <Badge tone="warning">{formatEnumLabel(report.status)}</Badge>
                  </div>
                );
              })}
              {followUpReports.length === 0 ? <div className="route-item">No follow-up requests are open.</div> : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-2">
        <Card>
          <CardHeader>
            <h2>{isCompanyViewer ? "Company Health" : "Team Health"}</h2>
            <p>Status, pacing, confidence, and missing weekly reports in your visible scope.</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-2">
              <div className="route-grid">
                <div className="route-item">
                  <span>Average KR confidence</span>
                  <strong>{averageConfidence(confidenceAggregate._avg.confidenceScore)}</strong>
                </div>
                <div className="route-item">
                  <span>Missing weekly reports</span>
                  <strong>{missingReportUsers.length}</strong>
                </div>
                {krStatusGroups.map((group) => (
                  <div className="route-item" key={group.status}>
                    <span>Status: {formatEnumLabel(group.status)}</span>
                    <strong>{group._count}</strong>
                  </div>
                ))}
              </div>
              <div className="route-grid">
                {krPacingGroups.map((group) => (
                  <div className="route-item" key={group.pacingStatus}>
                    <span>Pacing: {formatEnumLabel(group.pacingStatus)}</span>
                    <strong>{group._count}</strong>
                  </div>
                ))}
                {missingReportUsers.slice(0, 5).map((scopedUser) => (
                  <div className="route-item" key={scopedUser.id}>
                    <span>
                      <strong>{scopedUser.name}</strong>
                      <br />
                      <span className="muted">
                        {scopedUser.department?.name ?? "No department"}
                        {scopedUser.team ? ` / ${scopedUser.team.name}` : ""}
                      </span>
                    </span>
                    <Badge tone="warning">Missing</Badge>
                  </div>
                ))}
                {pendingReviewsByOwner.map((group) => (
                  <div className="route-item" key={group.label}>
                    <span>Pending review owner: {group.label}</span>
                    <strong>{group.count}</strong>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2>Risk Items</h2>
            <p>KRs that are off track, behind pace, or low confidence.</p>
          </CardHeader>
          <CardContent>
            <div className="route-grid">
              {riskKrs.map((kr) => (
                <div className="route-item" key={kr.id}>
                  <span>
                    <Link href={`/key-results/${kr.id}`}>
                      <strong>{kr.title}</strong>
                    </Link>
                    <br />
                    <span className="muted">
                      {kr.objective.title} / {kr.owner?.name ?? "No owner"} / Confidence {kr.confidenceScore}/5
                      <br />
                      {getKrRiskReasons(kr).join(", ")}
                    </span>
                  </span>
                  <span className="table-actions">
                    <Badge tone={workStatusTone(kr.status)}>{formatEnumLabel(kr.status)}</Badge>
                    <Badge tone={pacingStatusTone(kr.pacingStatus)}>{formatEnumLabel(kr.pacingStatus)}</Badge>
                  </span>
                </div>
              ))}
              {riskKrs.length === 0 ? <div className="route-item">No risk KRs in your visible scope.</div> : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2>Objective Health</h2>
          <p>Objectives whose child KRs or child objectives signal a health problem.</p>
        </CardHeader>
        <CardContent>
          <div className="route-grid">
            {atRiskObjectives.map((objective) => (
              <div className="route-item" key={objective.id}>
                <span>
                  <Link href={`/objectives/${objective.id}`}>
                    <strong>{objective.title}</strong>
                  </Link>
                  <br />
                  <span className="muted">
                    {objective.owner.name} / {formatEnumLabel(objective.progressSource)} / {objective.childCount} children
                    {objective.health.reason ? ` — ${objective.health.reason}` : ""}
                  </span>
                </span>
                <Badge tone={workStatusTone(objective.health.computedStatus!)}>{formatEnumLabel(objective.health.computedStatus!)}</Badge>
              </div>
            ))}
            {atRiskObjectives.length === 0 ? <div className="route-item">No objectives have health signals from children in your scope.</div> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2>Escalations</h2>
          <p>Manager-flagged weekly report risks in your visible scope.</p>
        </CardHeader>
        <CardContent>
          <div className="route-grid">
            {escalatedReviews.map((review) => (
              <div className="route-item" key={review.id}>
                <span>
                  <strong>{review.weeklyReport.user.name}</strong>
                  <br />
                  <span className="muted">
                    Flagged by {review.manager.name} / {review.weeklyReport.user.department?.name ?? "No department"}
                    {review.comment ? ` / ${review.comment}` : ""}
                  </span>
                </span>
                <Badge tone="danger">Escalated</Badge>
              </div>
            ))}
            {escalatedReviews.length === 0 ? <div className="route-item">No manager-flagged escalations in your visible scope.</div> : null}
          </div>
        </CardContent>
      </Card>

      {isCompanyViewer ? (
        <Card>
          <CardHeader>
            <h2>Department Health</h2>
            <p>Comparison of OKR health, review flow, missing updates, and escalations by department.</p>
          </CardHeader>
          <CardContent>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Objectives</th>
                    <th>KRs</th>
                    <th>Avg Confidence</th>
                    <th>Status</th>
                    <th>Pacing</th>
                    <th>Reviews</th>
                    <th>Missing</th>
                    <th>Risks</th>
                  </tr>
                </thead>
                <tbody>
                  {departmentHealthRows.map((department) => (
                    <tr key={department.id}>
                      <td>
                        <strong>{department.name}</strong>
                      </td>
                      <td>{department.objectiveCount}</td>
                      <td>{department.keyResultCount}</td>
                      <td>{averageConfidence(department.averageConfidence)}</td>
                      <td>{department.statusSummary}</td>
                      <td>{department.pacingSummary}</td>
                      <td>
                        {department.reviewCompletion}
                        <br />
                        <span className="muted">{department.pendingReviews} pending</span>
                      </td>
                      <td>
                        <Badge tone={department.missingReports > 0 ? "warning" : "success"}>{String(department.missingReports)}</Badge>
                      </td>
                      <td>
                        <span className="table-actions">
                          <Badge tone={department.riskCount > 0 ? "danger" : "success"}>{department.riskCount} KRs</Badge>
                          <Badge tone={department.escalations > 0 ? "danger" : "success"}>{department.escalations} escalations</Badge>
                        </span>
                      </td>
                    </tr>
                  ))}
                  {departmentHealthRows.length === 0 ? (
                    <tr>
                      <td colSpan={9}>No departments are available.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isCompanyViewer ? (
        <Card>
          <CardHeader>
            <h2>Recent Audit Activity</h2>
            <p>Latest create, update, submit, and review events.</p>
          </CardHeader>
          <CardContent>
            <div className="route-grid">
              {recentAuditLogs.map((log) => (
                <div className="route-item" key={log.id}>
                  <span>
                    <strong>
                      {formatEnumLabel(log.action)} {log.entityType}
                    </strong>
                    <br />
                    <span className="muted">{log.actor?.name ?? "System"} / {formatShortDate(log.createdAt)}</span>
                  </span>
                  <Link href="/admin/audit-log">Audit log</Link>
                </div>
              ))}
              {recentAuditLogs.length === 0 ? <div className="route-item">No audit events have been recorded yet.</div> : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
