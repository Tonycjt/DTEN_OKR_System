import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Prisma, UserRole } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatCard } from "@/components/ui/stat-card";
import { pacingStatusTone, weeklyReportStatusTone, workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { reviewOwnerWhere, reviewQueueWhere } from "@/lib/review-routing";
import { formatShortDate, getMondayWeekStart, getSundayWeekEnd } from "@/lib/week";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

const submittedReportStatuses = ["SUBMITTED", "REVIEWED", "NEEDS_FOLLOW_UP"] as const;

function averageConfidence(value: number | null | undefined) {
  return value == null ? "n/a" : `${value.toFixed(1)}/5`;
}

function roleDashboardLabel(role: UserRole) {
  if (role === "CEO" || role === "ADMIN") {
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

export default async function DashboardPage() {
  const user = await requireUser();
  const weekStart = getMondayWeekStart();
  const weekEnd = getSundayWeekEnd(weekStart);
  const isCompanyViewer = user.role === "ADMIN" || user.role === "CEO";
  const isDepartmentViewer = user.role === "DEPARTMENT_HEAD" && Boolean(user.departmentId);
  const isManager = user.role === "MANAGER";

  const userScopeWhere: Prisma.UserWhereInput = {
    isActive: true,
    ...(isCompanyViewer ? {} : isDepartmentViewer ? { departmentId: user.departmentId } : isManager ? reviewOwnerWhere(user.id) : { id: user.id }),
  };

  const [currentReport, assignedKrs, followUpReports, unreadNotifications, scopedUsers] = await Promise.all([
    prisma.weeklyReport.findFirst({
      where: {
        userId: user.id,
        weekStart,
      },
      include: {
        priorities: true,
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
    prisma.notification.count({
      where: {
        userId: user.id,
        readAt: null,
      },
    }),
    prisma.user.findMany({
      where: userScopeWhere,
      orderBy: { name: "asc" },
      include: {
        department: true,
        team: true,
      },
    }),
  ]);

  const scopedUserIds = scopedUsers.map((scopedUser) => scopedUser.id);
  const reportScopeUserIds = scopedUserIds.length > 0 ? scopedUserIds : [user.id];
  const krScopeWhere: Prisma.KeyResultWhereInput = isCompanyViewer
    ? {}
    : isDepartmentViewer
      ? { owner: { departmentId: user.departmentId } }
      : isManager
        ? { ownerId: { in: reportScopeUserIds } }
        : { ownerId: user.id };
  const objectiveScopeWhere: Prisma.ObjectiveWhereInput = isCompanyViewer
    ? {}
    : isDepartmentViewer
      ? { departmentId: user.departmentId }
      : isManager
        ? { ownerId: { in: reportScopeUserIds } }
        : { ownerId: user.id };

  const [
    reportsThisWeek,
    pendingReviews,
    totalObjectives,
    totalKrs,
    krStatusGroups,
    krPacingGroups,
    confidenceAggregate,
    riskKrs,
    recentAuditLogs,
  ] = await Promise.all([
    prisma.weeklyReport.findMany({
      where: {
        userId: { in: reportScopeUserIds },
        weekStart,
      },
      include: {
        user: true,
      },
    }),
    user.role === "EMPLOYEE"
      ? Promise.resolve(0)
      : prisma.weeklyReport.count({
          where: {
            status: "SUBMITTED",
            ...(user.role === "ADMIN" ? {} : reviewQueueWhere(user.id)),
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
      where: {
        ...krScopeWhere,
        OR: [{ status: { in: ["AT_RISK", "OFF_TRACK"] } }, { pacingStatus: "BEHIND" }, { confidenceScore: { lte: 2 } }],
      },
      orderBy: [{ confidenceScore: "asc" }, { updatedAt: "desc" }],
      take: 8,
      include: {
        owner: true,
        objective: true,
      },
    }),
    isCompanyViewer
      ? prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { actor: true },
        })
      : Promise.resolve([]),
  ]);

  const reportsByUserId = new Map(reportsThisWeek.map((report) => [report.userId, report]));
  const missingReportUsers = scopedUsers.filter((scopedUser) => {
    const report = reportsByUserId.get(scopedUser.id);
    return !report || !submittedReportStatuses.includes(report.status as (typeof submittedReportStatuses)[number]);
  });

  return (
    <div className="stack">
      <PageHeader
        title={`Welcome, ${user.name}`}
        description={`${roleDashboardLabel(user.role)} for ${formatShortDate(weekStart)} to ${formatShortDate(weekEnd)}.`}
        actions={
          <LinkButton href="/weekly-report/current">
            Open Weekly Report
            <ArrowRight size={16} aria-hidden="true" />
          </LinkButton>
        }
      />

      <div className="grid grid-3">
        <StatCard
          label="Current Report"
          value={currentReport ? formatEnumLabel(currentReport.status) : "Not Started"}
          detail={currentReport ? `${currentReport.priorities.length} priorities` : "create this week"}
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

      <div className="grid grid-3">
        <StatCard label="Objectives" value={String(totalObjectives)} detail="visible scope" tone="info" />
        <StatCard label="Key Results" value={String(totalKrs)} detail="visible scope" tone="success" />
        <StatCard label="Pending Reviews" value={String(pendingReviews)} detail="submitted reports" tone="warning" />
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
                      {kr.objective.title} / {kr.owner.name} / Confidence {kr.confidenceScore}/5
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
