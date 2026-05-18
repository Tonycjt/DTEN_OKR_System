import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { FollowUpStatus, Prisma, WorkStatus } from "@prisma/client";
import { updateFollowUpStatusAction } from "@/app/follow-ups/actions";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatCard } from "@/components/ui/stat-card";
import { pacingStatusTone, weeklyReportStatusTone, workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { reviewOwnerWhere, reviewQueueWhere } from "@/lib/review-routing";
import { formatReviewCompletionRate, getKrRiskReasons, krRiskWhere } from "@/lib/risk-detection";
import { formatShortDate, getMondayWeekStart, getSundayWeekEnd } from "@/lib/week";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

const submittedReportStatuses = ["SUBMITTED", "REVIEWED", "NEEDS_FOLLOW_UP"] as const;
const followUpStatuses: FollowUpStatus[] = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"];
const workStatuses: WorkStatus[] = ["DRAFT", "ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETED", "ON_HOLD"];

type DashboardSearchParams = Record<string, string | string[] | undefined>;
type DashboardPageProps = { searchParams?: Promise<DashboardSearchParams> };

type DashboardFilters = {
  ownerId?: string;
  status?: WorkStatus;
  quarter?: string;
};

function firstSearchParam(params: DashboardSearchParams, key: string) {
  const value = params[key];
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

function parseDashboardFilters(params: DashboardSearchParams): DashboardFilters {
  const status = firstSearchParam(params, "status");
  return {
    ownerId: firstSearchParam(params, "ownerId"),
    quarter: firstSearchParam(params, "quarter"),
    status: status && workStatuses.includes(status as WorkStatus) ? (status as WorkStatus) : undefined,
  };
}

function activeFilterCount(filters: DashboardFilters) {
  return Object.values(filters).filter(Boolean).length;
}

function dashboardFilterSearch(filters: DashboardFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function averageConfidence(value: number | null | undefined) {
  return value == null ? "n/a" : `${value.toFixed(1)}/5`;
}

function followUpStatusTone(status: FollowUpStatus) {
  if (status === "DONE") return "success";
  if (status === "IN_PROGRESS") return "info";
  if (status === "CANCELLED") return "neutral";
  return "warning";
}

function roleDashboardLabel(role: string) {
  if (role === "CEO" || role === "ADMIN" || role === "EXECUTIVE") return "Company command view";
  if (role === "DEPARTMENT_HEAD") return "Department execution view";
  if (role === "MANAGER") return "Manager review view";
  return "Employee execution view";
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requireUser();
  const filters = parseDashboardFilters((await searchParams) ?? {});
  const filtersActiveCount = activeFilterCount(filters);
  const filterSearch = dashboardFilterSearch(filters);
  const weekStart = getMondayWeekStart();
  const weekEnd = getSundayWeekEnd(weekStart);

  const isExecutive = user.role === "CEO" || user.role === "ADMIN" || user.role === "EXECUTIVE";
  const isDeptHead = user.role === "DEPARTMENT_HEAD";
  const isManager = user.role === "MANAGER";
  const isManagerLevel = isManager || isDeptHead;
  const isEmployee = !isExecutive && !isManagerLevel;

  // Scope for manager/exec queries
  const managerScopeUserWhere: Prisma.UserWhereInput = isExecutive
    ? { isActive: true }
    : isDeptHead
    ? { isActive: true, ...(user.departmentId ? { departmentId: user.departmentId } : {}) }
    : isManager
    ? { isActive: true, ...reviewOwnerWhere(user.id) }
    : { id: user.id };

  const krDimFilter: Prisma.KeyResultWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.quarter ? { objective: { quarter: filters.quarter } } : {}),
  };

  // --- Common queries (all roles) ---
  const [currentReport, assignedKrs, assignedFollowUps] = await Promise.all([
    prisma.weeklyReport.findFirst({
      where: { userId: user.id, weekStart },
      include: { weeklyTasks: { select: { id: true } } },
    }),
    prisma.keyResult.findMany({
      where: {
        ownerId: user.id,
        ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
        ...krDimFilter,
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 8,
      include: { objective: { select: { title: true, quarter: true } } },
    }),
    prisma.followUp.findMany({
      where: { ownerId: user.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 8,
      include: { assignedBy: { select: { name: true } } },
    }),
  ]);

  // --- Employee-only ---
  const myRiskKrs = isEmployee
    ? await prisma.keyResult.findMany({
        where: { ownerId: user.id, ...krRiskWhere },
        orderBy: [{ confidenceScore: "asc" }, { updatedAt: "desc" }],
        take: 8,
        include: { objective: { select: { title: true } } },
      })
    : [];

  // --- Manager/DeptHead/Exec shared scope queries ---
  const [scopedUsers, reportsThisWeek, pendingReviewReports, teamRiskKrs, krStatusGroups, krPacingGroups, confidenceAggregate, filterOwnerOptions, filterQuarterOptions] =
    !isEmployee
      ? await Promise.all([
          prisma.user.findMany({
            where: managerScopeUserWhere,
            orderBy: { name: "asc" },
            include: { department: true, team: true },
          }),
          prisma.weeklyReport.findMany({
            where: { user: managerScopeUserWhere, weekStart },
            include: { user: { select: { id: true, name: true } } },
          }),
          prisma.weeklyReport.findMany({
            where: {
              status: "SUBMITTED",
              ...(isManager ? reviewQueueWhere(user.id) : { user: managerScopeUserWhere }),
              ...(filters.ownerId ? { userId: filters.ownerId } : {}),
            },
            orderBy: [{ submittedAt: "asc" }, { updatedAt: "asc" }],
            take: 10,
            include: {
              user: {
                include: { department: true, team: true, manager: true, reviewOwner: true },
              },
            },
          }),
          prisma.keyResult.findMany({
            where: {
              owner: managerScopeUserWhere,
              ...krRiskWhere,
              ...krDimFilter,
              ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
            },
            orderBy: [{ confidenceScore: "asc" }, { updatedAt: "desc" }],
            take: 10,
            include: { owner: { select: { name: true } }, objective: { select: { title: true } } },
          }),
          prisma.keyResult.groupBy({
            by: ["status"],
            where: { owner: managerScopeUserWhere, ...krDimFilter },
            _count: true,
          }),
          prisma.keyResult.groupBy({
            by: ["pacingStatus"],
            where: { owner: managerScopeUserWhere, ...krDimFilter },
            _count: true,
          }),
          prisma.keyResult.aggregate({
            where: { owner: managerScopeUserWhere, ...krDimFilter },
            _avg: { confidenceScore: true },
          }),
          prisma.user.findMany({
            where: managerScopeUserWhere,
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          }),
          prisma.objective.findMany({
            where: { owner: managerScopeUserWhere },
            select: { quarter: true },
            orderBy: { quarter: "desc" },
          }),
        ])
      : [[], [], [], [], [], [], { _avg: { confidenceScore: null } }, [], []];

  // --- Exec-only: department health + escalated reviews ---
  const [departmentsForHealth, escalatedReviews] = isExecutive
    ? await Promise.all([
        prisma.department.findMany({
          orderBy: { name: "asc" },
          include: {
            users: {
              where: { isActive: true },
              include: {
                weeklyReports: { where: { weekStart }, include: { reviews: true } },
                ownedKeyResults: { where: krDimFilter },
              },
            },
            objectives: { where: {} },
          },
        }),
        prisma.managerReview.findMany({
          where: { decision: "RISK_FLAGGED" },
          orderBy: { createdAt: "desc" },
          take: 8,
          include: {
            manager: { select: { name: true } },
            weeklyReport: {
              include: { user: { include: { department: true, team: true } } },
            },
          },
        }),
      ])
    : [[], []];

  // Derived
  const reportsByUserId = new Map((reportsThisWeek as Array<{ userId: string; status: string }>).map((r) => [r.userId, r]));
  const missingReportUsers = (scopedUsers as Array<{
    id: string;
    name: string;
    managerId: string | null;
    reviewOwnerId: string | null;
    department?: { name: string } | null;
    team?: { name: string } | null;
  }>).filter((u) => {
    if (u.id === user.id) return false;
    // Only show direct reports of the current user, regardless of role
    const isDirectReport =
      u.reviewOwnerId === user.id ||
      (u.reviewOwnerId === null && u.managerId === user.id);
    if (!isDirectReport) return false;
    const report = reportsByUserId.get(u.id);
    return !report || !submittedReportStatuses.includes(report.status as (typeof submittedReportStatuses)[number]);
  });

  const reviewableReports = (reportsThisWeek as Array<{ status: string }>).filter((r) =>
    submittedReportStatuses.includes(r.status as (typeof submittedReportStatuses)[number]),
  );
  const completedReviews = reviewableReports.filter((r) => r.status === "REVIEWED" || r.status === "NEEDS_FOLLOW_UP");

  const uniqueQuarters = Array.from(
    new Set((filterQuarterOptions as Array<{ quarter: string }>).map((o) => o.quarter)),
  )
    .sort()
    .reverse();

  const departmentHealthRows = (departmentsForHealth as Array<{
    id: string;
    name: string;
    users: Array<{
      weeklyReports: Array<{ status: string; reviews: unknown[] }>;
      ownedKeyResults: Array<{ status: string; pacingStatus: string; confidenceScore: number; progressPercent: number }>;
    }>;
    objectives: unknown[];
  }>).map((dept) => {
    const krs = dept.users.flatMap((u) => u.ownedKeyResults);
    const reports = dept.users.flatMap((u) => u.weeklyReports);
    const submitted = reports.filter((r) => submittedReportStatuses.includes(r.status as (typeof submittedReportStatuses)[number]));
    const completed = reports.filter((r) => r.status === "REVIEWED" || r.status === "NEEDS_FOLLOW_UP");
    const missing = dept.users.filter((u) => {
      const r = u.weeklyReports[0];
      return !r || !submittedReportStatuses.includes(r.status as (typeof submittedReportStatuses)[number]);
    }).length;
    const confidenceSum = krs.reduce((s, kr) => s + kr.confidenceScore, 0);
    const riskCount = krs.filter((kr) => getKrRiskReasons(kr as Parameters<typeof getKrRiskReasons>[0]).length > 0).length;
    const statusCounts = krs.reduce((m, kr) => m.set(kr.status, (m.get(kr.status) ?? 0) + 1), new Map<string, number>());
    const statusSummary = Array.from(statusCounts.entries()).filter(([, c]) => c > 0).map(([s, c]) => `${formatEnumLabel(s)} ${c}`).join(" / ") || "none";

    return {
      id: dept.id,
      name: dept.name,
      objectiveCount: dept.objectives.length,
      keyResultCount: krs.length,
      averageConfidence: krs.length === 0 ? null : confidenceSum / krs.length,
      statusSummary,
      missingReports: missing,
      reviewCompletion: formatReviewCompletionRate(completed.length, submitted.length),
      riskCount,
    };
  });

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
            {!isEmployee ? (
              <LinkButton href={`/dashboard/export${filterSearch}`} tone="secondary">
                Export CSV
              </LinkButton>
            ) : null}
            {isExecutive ? (
              <LinkButton href="/executive-summary" tone="secondary">
                Summary
              </LinkButton>
            ) : null}
          </span>
        }
      />

      {/* Simplified filters — Owner, Status, Quarter only */}
      {!isEmployee ? (
        <Card>
          <CardHeader>
            <h2>Filters</h2>
            <p>Narrow the view without changing your role-based access scope.</p>
          </CardHeader>
          <CardContent>
            <form className="dashboard-filter-form" method="get">
              <label className="field">
                <span>Owner</span>
                <select defaultValue={filters.ownerId ?? ""} name="ownerId">
                  <option value="">All visible owners</option>
                  {(filterOwnerOptions as Array<{ id: string; name: string }>).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Status</span>
                <select defaultValue={filters.status ?? ""} name="status">
                  <option value="">All statuses</option>
                  {workStatuses.map((s) => (
                    <option key={s} value={s}>
                      {formatEnumLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Quarter</span>
                <select defaultValue={filters.quarter ?? ""} name="quarter">
                  <option value="">All quarters</option>
                  {uniqueQuarters.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </label>
              <div className="dashboard-filter-actions">
                <Button type="submit">Apply</Button>
                <LinkButton href="/dashboard" tone="secondary">Reset</LinkButton>
                <Badge tone={filtersActiveCount > 0 ? "info" : "neutral"}>{filtersActiveCount} active</Badge>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* ── EMPLOYEE VIEW ─────────────────────────────────────── */}
      {isEmployee ? (
        <>
          <div className="grid grid-3">
            <StatCard
              label="Current Report"
              value={currentReport ? formatEnumLabel(currentReport.status) : "Not Started"}
              detail={currentReport ? `${currentReport.weeklyTasks.length} task${currentReport.weeklyTasks.length !== 1 ? "s" : ""}` : "create this week"}
              tone={currentReport?.status === "NEEDS_FOLLOW_UP" ? "warning" : currentReport ? "success" : "info"}
            />
            <StatCard label="Assigned KRs" value={String(assignedKrs.length)} detail="owned by you" tone="info" />
            <StatCard
              label="Open Follow-ups"
              value={String(assignedFollowUps.length)}
              detail={assignedFollowUps.length > 0 ? "needs attention" : "all clear"}
              tone={assignedFollowUps.length > 0 ? "warning" : "success"}
            />
          </div>

          <div className="grid grid-2">
            <Card>
              <CardHeader>
                <h2>Assigned KRs</h2>
                <p>Your key results — progress, confidence, status, and pacing.</p>
              </CardHeader>
              <CardContent>
                <div className="route-grid">
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
                <h2>Follow-ups Assigned to Me</h2>
                <p>Open action items requiring your response.</p>
              </CardHeader>
              <CardContent>
                <div className="route-grid">
                  {assignedFollowUps.map((f) => (
                    <div className="route-item" key={f.id}>
                      <span>
                        <strong>{f.content}</strong>
                        <br />
                        <span className="muted">
                          From {f.assignedBy.name}
                          {f.dueDate ? ` / Due ${formatShortDate(f.dueDate)}` : ""}
                        </span>
                      </span>
                      <form action={updateFollowUpStatusAction} className="table-actions">
                        <input name="followUpId" type="hidden" value={f.id} />
                        <input name="redirectPath" type="hidden" value="/dashboard" />
                        <select className="inline-select" defaultValue={f.status} name="status">
                          {followUpStatuses.map((s) => (
                            <option key={s} value={s}>{formatEnumLabel(s)}</option>
                          ))}
                        </select>
                        <Button tone="secondary" type="submit">Save</Button>
                      </form>
                    </div>
                  ))}
                  {assignedFollowUps.length === 0 ? <div className="route-item">No open follow-ups assigned to you.</div> : null}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <h2>My Risk Items</h2>
              <p>Your KRs that are blocked, off track, behind pace, low confidence, or missing updates.</p>
            </CardHeader>
            <CardContent>
              <div className="route-grid">
                {myRiskKrs.map((kr) => (
                  <div className="route-item" key={kr.id}>
                    <span>
                      <Link href={`/key-results/${kr.id}`}>
                        <strong>{kr.title}</strong>
                      </Link>
                      <br />
                      <span className="muted">
                        {kr.objective.title} / Confidence {kr.confidenceScore}/5
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
                {myRiskKrs.length === 0 ? <div className="route-item">No risk signals on your KRs.</div> : null}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* ── MANAGER / DEPARTMENT HEAD VIEW ────────────────────── */}
      {isManagerLevel ? (
        <>
          <div className="grid grid-3">
            <StatCard
              label="Pending Reviews"
              value={String(pendingReviewReports.length)}
              detail="submitted, awaiting review"
              tone={pendingReviewReports.length > 0 ? "warning" : "success"}
            />
            <StatCard
              label="Missing Updates"
              value={String(missingReportUsers.length)}
              detail="current week"
              tone={missingReportUsers.length > 0 ? "warning" : "success"}
            />
            <StatCard
              label="Team Risk KRs"
              value={String(teamRiskKrs.length)}
              detail="off track, behind, or low confidence"
              tone={teamRiskKrs.length > 0 ? "danger" : "success"}
            />
          </div>

          <div className="grid grid-2">
            <Card>
              <CardHeader>
                <h2>Pending Reviews</h2>
                <p>Submitted weekly reports awaiting your review action.</p>
              </CardHeader>
              <CardContent>
                <div className="route-grid">
                  {pendingReviewReports.map((report) => (
                    <div className="route-item" key={report.id}>
                      <span>
                        <strong>{report.user.name}</strong>
                        <br />
                        <span className="muted">
                          {report.user.department?.name ?? "No department"}
                          {report.user.team ? ` / ${report.user.team.name}` : ""}
                          {" / "}{formatShortDate(report.weekStart)}
                        </span>
                      </span>
                      <LinkButton href={`/reviews/pending`} tone="secondary">
                        Review
                      </LinkButton>
                    </div>
                  ))}
                  {pendingReviewReports.length === 0 ? <div className="route-item">No pending reviews.</div> : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2>Missing Updates</h2>
                <p>Your direct reports who have not submitted a report this week.</p>
              </CardHeader>
              <CardContent>
                <div className="route-grid">
                  {missingReportUsers.map((u) => (
                    <div className="route-item" key={u.id}>
                      <span>
                        <strong>{u.name}</strong>
                        <br />
                        <span className="muted">
                          {u.department?.name ?? "No department"}
                          {u.team ? ` / ${u.team.name}` : ""}
                        </span>
                      </span>
                      <Badge tone="warning">Missing</Badge>
                    </div>
                  ))}
                  {missingReportUsers.length === 0 ? <div className="route-item">All scoped users have submitted reports this week.</div> : null}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-2">
            <Card>
              <CardHeader>
                <h2>Team Risk Items</h2>
                <p>KRs in your scope that are off track, behind pace, or low confidence.</p>
              </CardHeader>
              <CardContent>
                <div className="route-grid">
                  {teamRiskKrs.map((kr) => (
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
                  {teamRiskKrs.length === 0 ? <div className="route-item">No risk KRs in your scope.</div> : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2>Team KR Health</h2>
                <p>KR status, pacing, and confidence summary for your scope.</p>
              </CardHeader>
              <CardContent>
                <div className="route-grid">
                  <div className="route-item">
                    <span>Average confidence</span>
                    <strong>{averageConfidence(confidenceAggregate._avg.confidenceScore)}</strong>
                  </div>
                  <div className="route-item">
                    <span>Review completion</span>
                    <strong>{formatReviewCompletionRate(completedReviews.length, reviewableReports.length)}</strong>
                  </div>
                  {(krStatusGroups as Array<{ status: string; _count: number }>).map((g) => (
                    <div className="route-item" key={g.status}>
                      <span>Status: {formatEnumLabel(g.status)}</span>
                      <strong>{g._count}</strong>
                    </div>
                  ))}
                  {(krPacingGroups as Array<{ pacingStatus: string; _count: number }>).map((g) => (
                    <div className="route-item" key={g.pacingStatus}>
                      <span>Pacing: {formatEnumLabel(g.pacingStatus)}</span>
                      <strong>{g._count}</strong>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <h2>Follow-ups Assigned to Me</h2>
              <p>Open action items assigned to you.</p>
            </CardHeader>
            <CardContent>
              <div className="route-grid">
                {assignedFollowUps.map((f) => (
                  <div className="route-item" key={f.id}>
                    <span>
                      <strong>{f.content}</strong>
                      <br />
                      <span className="muted">
                        From {f.assignedBy.name}
                        {f.dueDate ? ` / Due ${formatShortDate(f.dueDate)}` : ""}
                      </span>
                    </span>
                    <form action={updateFollowUpStatusAction} className="table-actions">
                      <input name="followUpId" type="hidden" value={f.id} />
                      <input name="redirectPath" type="hidden" value="/dashboard" />
                      <select className="inline-select" defaultValue={f.status} name="status">
                        {followUpStatuses.map((s) => (
                          <option key={s} value={s}>{formatEnumLabel(s)}</option>
                        ))}
                      </select>
                      <Button tone="secondary" type="submit">Save</Button>
                    </form>
                  </div>
                ))}
                {assignedFollowUps.length === 0 ? <div className="route-item">No open follow-ups assigned to you.</div> : null}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* ── EXECUTIVE / CEO / ADMIN VIEW ──────────────────────── */}
      {isExecutive ? (
        <>
          <div className="grid grid-3">
            <StatCard
              label="Pending Reviews"
              value={String(pendingReviewReports.length)}
              detail="submitted, awaiting review"
              tone={pendingReviewReports.length > 0 ? "warning" : "success"}
            />
            <StatCard
              label="Missing Updates"
              value={String(missingReportUsers.length)}
              detail="current week"
              tone={missingReportUsers.length > 0 ? "warning" : "success"}
            />
            <StatCard
              label="Escalated Reviews"
              value={String(escalatedReviews.length)}
              detail="risk flagged"
              tone={escalatedReviews.length > 0 ? "danger" : "success"}
            />
          </div>

          <div className="grid grid-2">
            <Card>
              <CardHeader>
                <h2>Company Health</h2>
                <p>KR status, pacing, confidence, and review completion across the company.</p>
              </CardHeader>
              <CardContent>
                <div className="route-grid">
                  <div className="route-item">
                    <span>Average KR confidence</span>
                    <strong>{averageConfidence(confidenceAggregate._avg.confidenceScore)}</strong>
                  </div>
                  <div className="route-item">
                    <span>Review completion this week</span>
                    <strong>{formatReviewCompletionRate(completedReviews.length, reviewableReports.length)}</strong>
                  </div>
                  <div className="route-item">
                    <span>Missing weekly reports</span>
                    <strong>{missingReportUsers.length}</strong>
                  </div>
                  {(krStatusGroups as Array<{ status: string; _count: number }>).map((g) => (
                    <div className="route-item" key={g.status}>
                      <span>Status: {formatEnumLabel(g.status)}</span>
                      <strong>{g._count}</strong>
                    </div>
                  ))}
                  {(krPacingGroups as Array<{ pacingStatus: string; _count: number }>).map((g) => (
                    <div className="route-item" key={g.pacingStatus}>
                      <span>Pacing: {formatEnumLabel(g.pacingStatus)}</span>
                      <strong>{g._count}</strong>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2>Company Risk Items</h2>
                <p>KRs off track, behind pace, or low confidence, plus escalated reviews.</p>
              </CardHeader>
              <CardContent>
                <div className="route-grid">
                  {teamRiskKrs.map((kr) => (
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
                  {escalatedReviews.map((review) => (
                    <div className="route-item" key={review.id}>
                      <span>
                        <strong>{review.weeklyReport.user.name}</strong>
                        <br />
                        <span className="muted">
                          Escalated by {review.manager.name} / {review.weeklyReport.user.department?.name ?? "No dept"}
                          {review.comment ? ` / ${review.comment}` : ""}
                        </span>
                      </span>
                      <Badge tone="danger">Escalated</Badge>
                    </div>
                  ))}
                  {teamRiskKrs.length === 0 && escalatedReviews.length === 0 ? (
                    <div className="route-item">No risk items or escalations.</div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-2">
            <Card>
              <CardHeader>
                <h2>Missing Updates</h2>
                <p>Your direct reports who have not submitted a report this week.</p>
              </CardHeader>
              <CardContent>
                <div className="route-grid">
                  {missingReportUsers.map((u) => (
                    <div className="route-item" key={u.id}>
                      <span>
                        <strong>{u.name}</strong>
                        <br />
                        <span className="muted">
                          {u.department?.name ?? "No department"}
                          {u.team ? ` / ${u.team.name}` : ""}
                        </span>
                      </span>
                      <Badge tone="warning">Missing</Badge>
                    </div>
                  ))}
                  {missingReportUsers.length === 0 ? <div className="route-item">All your direct reports have submitted reports this week.</div> : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2>Pending / Escalated Reviews</h2>
                <p>Submitted reports waiting for review and risk-flagged escalations.</p>
              </CardHeader>
              <CardContent>
                <div className="route-grid">
                  {pendingReviewReports.map((report) => (
                    <div className="route-item" key={report.id}>
                      <span>
                        <strong>{report.user.name}</strong>
                        <br />
                        <span className="muted">
                          {report.user.department?.name ?? "No department"}
                          {" / "}{formatShortDate(report.weekStart)}
                        </span>
                      </span>
                      <Badge tone="warning">Pending</Badge>
                    </div>
                  ))}
                  {pendingReviewReports.length === 0 ? <div className="route-item">No pending reviews.</div> : null}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <h2>Department Health</h2>
              <p>OKR health, review flow, missing updates, and risks by department.</p>
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
                      <th>Reviews</th>
                      <th>Missing</th>
                      <th>Risks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {departmentHealthRows.map((dept) => (
                      <tr key={dept.id}>
                        <td><strong>{dept.name}</strong></td>
                        <td>{dept.objectiveCount}</td>
                        <td>{dept.keyResultCount}</td>
                        <td>{averageConfidence(dept.averageConfidence)}</td>
                        <td>{dept.statusSummary}</td>
                        <td>{dept.reviewCompletion}</td>
                        <td>
                          <Badge tone={dept.missingReports > 0 ? "warning" : "success"}>{String(dept.missingReports)}</Badge>
                        </td>
                        <td>
                          <Badge tone={dept.riskCount > 0 ? "danger" : "success"}>{dept.riskCount} KRs</Badge>
                        </td>
                      </tr>
                    ))}
                    {departmentHealthRows.length === 0 ? (
                      <tr><td colSpan={8}>No departments available.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2>Follow-ups Assigned to Me</h2>
              <p>Open action items assigned to you.</p>
            </CardHeader>
            <CardContent>
              <div className="route-grid">
                {assignedFollowUps.map((f) => (
                  <div className="route-item" key={f.id}>
                    <span>
                      <strong>{f.content}</strong>
                      <br />
                      <span className="muted">
                        From {f.assignedBy.name}
                        {f.dueDate ? ` / Due ${formatShortDate(f.dueDate)}` : ""}
                      </span>
                    </span>
                    <form action={updateFollowUpStatusAction} className="table-actions">
                      <input name="followUpId" type="hidden" value={f.id} />
                      <input name="redirectPath" type="hidden" value="/dashboard" />
                      <select className="inline-select" defaultValue={f.status} name="status">
                        {followUpStatuses.map((s) => (
                          <option key={s} value={s}>{formatEnumLabel(s)}</option>
                        ))}
                      </select>
                      <Button tone="secondary" type="submit">Save</Button>
                    </form>
                  </div>
                ))}
                {assignedFollowUps.length === 0 ? <div className="route-item">No open follow-ups assigned to you.</div> : null}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
