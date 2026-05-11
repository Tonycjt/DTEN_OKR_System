"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlignmentBadge } from "@/components/ui/alignment-badge";
import { ApprovalStateBadge } from "@/components/ui/approval-state-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { VisibilityBadge } from "@/components/ui/visibility-badge";
import { loadLocalOkrStore } from "@/lib/local-okr-store";
import { mergeById } from "@/lib/merge-by-id";
import {
  approvals as seededApprovals,
  auditLogs,
  checkIns,
  comments,
  departments,
  keyResults as seededKeyResults,
  notifications,
  teams,
  users,
  weeklyReports,
} from "@/mock-data";
import { mockSessionEvent, useMockSessionUser } from "@/lib/mock-session";
import { findDepartment, findTeam, findUser, getMergedApprovals, getMergedObjectives } from "@/lib/mock-lookups";
import { averageObjectiveScore } from "@/lib/okr-metrics";
import { canViewObjective, canViewWeeklyReport } from "@/lib/permission-helpers";
import { deriveOkrUpdateStatus, getActiveObjectivesForUser, getCheckInsForUserWeek, getCurrentWeek, getWeeklyReportForWeek, getWeeklyUpdateCompliance, isValidCheckIn } from "@/lib/weekly-execution";
import { deriveWeeklyReminderStatus, getSavedWeeklyDraftTimestamp, getWeeklyReminderCta, weeklyReminderStatusTone, type WeeklyReminderStatus } from "@/lib/weekly-reminder-status";
import type { Approval, CheckIn, Comment, KeyResult, Notification, Objective, User, WeeklyReport } from "@/types";

type StatTone = "neutral" | "success" | "warning" | "danger" | "info";

export function HomeDashboard() {
  const user = useMockSessionUser();
  const [store, setStore] = useState(() => loadLocalOkrStore());

  useEffect(() => {
    const refresh = () => {
      setStore(loadLocalOkrStore());
    };

    refresh();
    window.addEventListener(mockSessionEvent, refresh);
    window.addEventListener("dten-local-okrs-updated", refresh);

    return () => {
      window.removeEventListener(mockSessionEvent, refresh);
      window.removeEventListener("dten-local-okrs-updated", refresh);
    };
  }, []);

  const allObjectives = useMemo(() => getMergedObjectives(store.objectives), [store.objectives]);
  const visibleObjectives = useMemo(() => {
    const permissionContext = {
      users,
      objectives: allObjectives,
    };

    return allObjectives.filter((objective) => canViewObjective(user, objective, permissionContext));
  }, [allObjectives, user]);
  const allApprovals = useMemo(() => getMergedApprovals(seededApprovals, store.approvals), [store.approvals]);
  const allNotifications = useMemo(() => mergeById(notifications, store.notifications), [store.notifications]);
  const allCheckIns = useMemo(() => mergeById(checkIns, store.checkIns), [store.checkIns]);
  const allWeeklyReports = useMemo(() => mergeById(weeklyReports, store.weeklyReports), [store.weeklyReports]);
  const allKeyResults = useMemo(() => mergeById(seededKeyResults, store.keyResults), [store.keyResults]);
  const activeQuarterId = "q2-2026";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Home"
        description={`${user.name} / ${user.role}. Weekly OKR operating dashboard for priorities, risks, and progress.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/okrs/new"
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-dten-blue bg-dten-blue px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Create OKR
            </Link>
            <Link
              href="/weekly-update"
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-ink-800 transition hover:bg-slate-50"
            >
              Complete Weekly Update
            </Link>
          </div>
        }
      />

      {user.role === "Leadership" ? (
        <LeadershipHome user={user} objectives={visibleObjectives} checkIns={allCheckIns} weeklyReports={allWeeklyReports} />
      ) : user.role === "Admin" ? (
        <AdminHome user={user} objectives={visibleObjectives} localAuditCount={store.auditLogs.length} />
      ) : (
        <EmployeeManagerHome
          user={user}
          objectives={visibleObjectives}
          approvals={allApprovals}
          notifications={allNotifications}
          weeklyReports={allWeeklyReports}
          checkIns={allCheckIns}
          keyResults={allKeyResults}
          activeQuarterId={activeQuarterId}
        />
      )}
    </div>
  );
}

function EmployeeManagerHome({
  user,
  objectives,
  approvals,
  notifications: allNotifications,
  weeklyReports: allWeeklyReports,
  checkIns: allCheckIns,
  keyResults: allKeyResults,
  activeQuarterId,
}: {
  user: User;
  objectives: Objective[];
  approvals: Approval[];
  notifications: Notification[];
  weeklyReports: WeeklyReport[];
  checkIns: CheckIn[];
  keyResults: KeyResult[];
  activeQuarterId: string;
}) {
  const week = getLatestMockWeek(allWeeklyReports);
  const myObjectives = objectives.filter((objective) => objective.ownerUserId === user.id && objective.quarterId === activeQuarterId);
  const activeObjectives = getActiveObjectivesForUser(user.id, { objectives, quarterId: activeQuarterId, week });
  const draftPendingRejected = myObjectives.filter((objective) =>
    ["Draft", "Pending Approval", "Rejected"].includes(objective.approvalState),
  );
  const recentNotifications = allNotifications.filter((notification) => notification.userId === user.id).slice(0, 4);
  const managerComments = getManagerComments(user, objectives, allWeeklyReports).slice(0, 4);
  const currentReport = getWeeklyReportForWeek(user.id, { weeklyReports: allWeeklyReports, week });
  const currentCheckIns = getCheckInsForUserWeek(user.id, { checkIns: allCheckIns, objectives, week });
  const okrUpdateStatus = currentReport?.okrUpdateStatus ?? deriveOkrUpdateStatus(activeObjectives, currentCheckIns);
  const updatedObjectiveIds = new Set(currentCheckIns.filter((checkIn) => isValidCheckIn(checkIn)).map((checkIn) => checkIn.objectiveId));
  const updatedActiveOkrCount = activeObjectives.filter((objective) => updatedObjectiveIds.has(objective.id)).length;
  const needsCheckInOkrCount = Math.max(activeObjectives.length - updatedActiveOkrCount, 0);
  const draftSavedAt = getSavedWeeklyDraftTimestamp(user.id, week.week_start_date);
  const weeklyStatus = deriveWeeklyReminderStatus({
    report: currentReport,
    okrUpdateStatus,
    hasSavedDraft: Boolean(draftSavedAt),
    weekEndDate: week.week_end_date,
  });

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-4">
        <WeeklyUpdateCard
          status={weeklyStatus}
          okrUpdateStatus={okrUpdateStatus}
          weekLabel={formatWeekRange(week.week_start_date, week.week_end_date)}
          activeOkrCount={activeObjectives.length}
          updatedOkrCount={updatedActiveOkrCount}
          needsCheckInOkrCount={needsCheckInOkrCount}
        />
        <DashboardStat label="Active OKRs" value={String(activeObjectives.length)} tone="success" />
        <DashboardStat label="Draft / Pending / Rejected" value={String(draftPendingRejected.length)} tone="warning" />
        <DashboardStat label="Average score" value={`${averageObjectiveScore(activeObjectives)}%`} tone="neutral" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <OkrSummaryCard title="My Active OKRs" objectives={activeObjectives} allObjectives={objectives} keyResults={allKeyResults} showKrPreview />
        <div className="space-y-4">
          <QuickActionsCard />
          <OkrSummaryCard title="Draft, Pending, and Rejected OKRs" objectives={draftPendingRejected} allObjectives={objectives} compact />
        </div>
      </div>

      {user.role === "Manager" ? <ManagerBlocks user={user} objectives={objectives} approvals={approvals} weeklyReports={allWeeklyReports} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <CommentsCard title="Recent Manager Comments" comments={managerComments} />
        <NotificationsCard notifications={recentNotifications} />
      </div>
    </>
  );
}

function ManagerBlocks({
  user,
  objectives,
  approvals: allApprovals,
  weeklyReports: allWeeklyReports,
}: {
  user: User;
  objectives: Objective[];
  approvals: Approval[];
  weeklyReports: WeeklyReport[];
}) {
  const directReports = getDirectReports(user.id);
  const directReportIds = new Set(directReports.map((report) => report.id));
  const directReportObjectives = objectives.filter((objective) => directReportIds.has(objective.ownerUserId));
  const pendingApprovals = allApprovals.filter((approval) => {
    const objective = objectives.find((item) => item.id === approval.objectiveId);
    return approval.approvalStatus === "Pending" && approval.approverUserId === user.id && Boolean(objective && directReportIds.has(objective.ownerUserId));
  });
  const permissionContext = {
    users,
    objectives,
  };
  const directReportReports = allWeeklyReports.filter(
    (report) => directReportIds.has(report.userId) && canViewWeeklyReport(user, report, permissionContext),
  );
  const missingUpdates = directReports.filter((report) => {
    const latestReport = getLatestReport(report.id, allWeeklyReports);
    return !latestReport || latestReport.okrUpdateStatus === "Not Updated" || latestReport.okrUpdateStatus === "Partially Updated";
  });
  const riskyObjectives = directReportObjectives.filter((objective) => objective.status === "At Risk" || objective.status === "Off Track");
  const challenges = directReportReports.filter((report) => report.challengesComments);
  const latestReportPreviews = directReports
    .map((report) => {
      const latestReport = getLatestReport(report.id, allWeeklyReports);
      return {
        id: report.id,
        title: report.name,
        meta: latestReport
          ? `${latestReport.okrUpdateStatus} / ${latestReport.nextWeekPriorities.filter(Boolean).join("; ") || "No priorities"}`
          : "No weekly report",
      };
    })
    .slice(0, 5);
  const completionRate = directReports.length
    ? Math.round((directReportReports.filter((report) => report.okrUpdateStatus === "Updated").length / directReports.length) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-5">
        <DashboardStat label="Pending approvals" value={String(pendingApprovals.length)} tone="warning" />
        <DashboardStat label="Missing or partial updates" value={String(missingUpdates.length)} tone="danger" />
        <DashboardStat label="At risk / off track" value={String(riskyObjectives.length)} tone="warning" />
        <DashboardStat label="Reported challenges" value={String(challenges.length)} tone="neutral" />
        <DashboardStat label="Team weekly completion" value={`${completionRate}%`} tone="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SimpleListCard
          title="Pending Approvals"
          emptyTitle="No pending approvals"
          items={pendingApprovals.map((approval) => {
            const objective = objectives.find((item) => item.id === approval.objectiveId);
            return {
              id: approval.id,
              title: objective?.title ?? "Unknown objective",
              meta: objective ? `${findUser(objective.ownerUserId)?.name ?? "Unknown owner"} / ${objective.status}` : "Pending approval",
            };
          })}
        />
        <SimpleListCard
          title="Direct Reports Missing Weekly Updates"
          emptyTitle="No missing updates"
          items={missingUpdates.map((report) => ({
            id: report.id,
            title: report.name,
            meta: getLatestReport(report.id, allWeeklyReports)?.okrUpdateStatus ?? "No report",
          }))}
        />
        <SimpleListCard
          title="At-risk / Off-track Objectives"
          emptyTitle="No at-risk objectives"
          items={riskyObjectives.map((objective) => ({
            id: objective.id,
            title: objective.title,
            meta: `${findUser(objective.ownerUserId)?.name ?? "Unknown owner"} / ${objective.status} / ${objective.confidence} confidence`,
          }))}
        />
        <SimpleListCard
          title="Reported Challenges This Week"
          emptyTitle="No reported challenges"
          items={challenges.map((report) => ({
            id: report.id,
            title: findUser(report.userId)?.name ?? "Unknown employee",
            meta: report.challengesComments ?? "",
          }))}
        />
        <SimpleListCard title="Latest Weekly Report Previews" emptyTitle="No weekly report previews" items={latestReportPreviews} />
      </div>
    </div>
  );
}

function LeadershipHome({
  objectives,
  checkIns: allCheckIns,
  weeklyReports: allWeeklyReports,
}: {
  user: User;
  objectives: Objective[];
  checkIns: typeof checkIns;
  weeklyReports: WeeklyReport[];
}) {
  const activeObjectives = objectives.filter((objective) => objective.isActive);
  const companyObjectives = activeObjectives.filter((objective) => objective.level === "company");
  const riskyObjectives = activeObjectives.filter((objective) => objective.status === "At Risk" || objective.status === "Off Track");
  const linkedCount = activeObjectives.filter((objective) => objective.parentObjectiveId).length;
  const unlinkedCount = activeObjectives.length - linkedCount;
  const autoRollupCount = 1;
  const weeklyCompliance = getWeeklyUpdateCompliance({ checkIns: allCheckIns, objectives, users: usersForHome(), week: getLatestMockWeek(allWeeklyReports) });
  const departmentRiskItems = departments
    .map((department) => {
      const departmentObjectives = activeObjectives.filter((objective) => objective.departmentId === department.id);
      const riskyCount = departmentObjectives.filter((objective) => objective.status === "At Risk" || objective.status === "Off Track").length;
      return {
        id: department.id,
        title: department.name,
        meta: `${riskyCount} risky / ${departmentObjectives.length} visible OKRs`,
        riskyCount,
      };
    })
    .filter((item) => item.riskyCount > 0);
  const teamRiskItems = teams
    .map((team) => {
      const teamObjectives = activeObjectives.filter((objective) => objective.teamId === team.id);
      const riskyCount = teamObjectives.filter((objective) => objective.status === "At Risk" || objective.status === "Off Track").length;
      return {
        id: team.id,
        title: team.name,
        meta: `${riskyCount} risky / ${teamObjectives.length} visible OKRs`,
        riskyCount,
      };
    })
    .filter((item) => item.riskyCount > 0);

  const riskyOrgItems = riskyObjectives.map((objective) => ({
    id: objective.id,
    title: findDepartment(objective.departmentId)?.name ?? findTeam(objective.teamId)?.name ?? "Company",
    meta: `${objective.status} / ${objective.confidence} confidence`,
  }));

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-5">
        <DashboardStat label="Company score" value={`${averageObjectiveScore(companyObjectives)}%`} tone="neutral" />
        <DashboardStat label="At-risk areas" value={String(riskyObjectives.length)} tone="warning" />
        <DashboardStat label="Weekly compliance" value={`${weeklyCompliance}%`} tone="success" />
        <DashboardStat label="Linked / unlinked" value={`${linkedCount}/${unlinkedCount}`} tone="info" />
        <DashboardStat label="Auto roll-up" value={`${autoRollupCount} KR`} tone="neutral" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <OkrSummaryCard title="Company Progress Summary" objectives={companyObjectives} allObjectives={objectives} />
        <SimpleListCard title="At-risk Departments and Teams" emptyTitle="No at-risk areas" items={riskyOrgItems} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-ink-950">Alignment Coverage</h2>
            <p className="mt-1 text-sm text-ink-600">Objective alignment links only. No dependency model is active.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProgressBar value={Math.round((linkedCount / Math.max(activeObjectives.length, 1)) * 100)} label="Linked coverage" />
            <div className="flex flex-wrap gap-2">
              <Badge tone="info">{linkedCount} linked</Badge>
              <Badge tone="neutral">{unlinkedCount} unlinked</Badge>
            </div>
          </CardContent>
        </Card>
        <SimpleListCard title="Department Risk" emptyTitle="No department risk" items={departmentRiskItems} />
        <SimpleListCard title="Team Risk" emptyTitle="No team risk" items={teamRiskItems} />
      </div>
    </>
  );
}

function AdminHome({ user, localAuditCount }: { user: User; objectives: Objective[]; localAuditCount: number }) {
  const usersWithoutManager = usersWithoutPrimaryManager();

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-5">
        <DashboardStat label="Users" value={String(teams.length + departments.length)} tone="neutral" />
        <DashboardStat label="Departments" value={String(departments.length)} tone="neutral" />
        <DashboardStat label="Teams" value={String(teams.length)} tone="neutral" />
        <DashboardStat label="Users without manager" value={String(usersWithoutManager.length)} tone="warning" />
        <DashboardStat label="Local audit events" value={String(localAuditCount)} tone="info" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-ink-950">Org Setup Summary</h2>
            <p className="mt-1 text-sm text-ink-600">{user.name} is viewing lightweight admin setup signals.</p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <AdminTile label="Departments/functions" value={String(departments.length)} />
            <AdminTile label="Teams" value={String(teams.length)} />
            <AdminTile label="Seeded audit logs" value={String(auditLogs.length)} />
            <AdminTile label="Visibility defaults" value="Placeholder" />
          </CardContent>
        </Card>
        <SimpleListCard
          title="Users Without Manager"
          emptyTitle="All users have managers"
          items={usersWithoutManager.map((item) => ({
            id: item.id,
            title: item.name,
            meta: item.role === "Leadership" ? "Top-level leadership user" : "Needs manager assignment",
          }))}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <PlaceholderCard title="Visibility Defaults" body="Default visibility configuration is a placeholder in this phase." />
        <PlaceholderCard title="Quarter Setup" body="Quarter management remains read-only mock data for now." />
        <PlaceholderCard title="Audit Log" body="Seeded and local prototype events can be displayed in a later admin phase." />
      </div>
    </>
  );
}

function WeeklyUpdateCard({
  status,
  okrUpdateStatus,
  weekLabel,
  activeOkrCount,
  updatedOkrCount,
  needsCheckInOkrCount,
}: {
  status: WeeklyReminderStatus;
  okrUpdateStatus: string;
  weekLabel: string;
  activeOkrCount: number;
  updatedOkrCount: number;
  needsCheckInOkrCount: number;
}) {
  const cta = getWeeklyReminderCta(status);
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink-600">Weekly Update</p>
            <p className="mt-2 text-2xl font-semibold text-ink-950">{status}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-600">{weekLabel}</p>
          </div>
          <Badge tone={weeklyReminderStatusTone(status)}>{okrUpdateStatus}</Badge>
        </div>
        <Link
          href="/weekly-update"
          className="mt-4 inline-flex min-h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-ink-800 transition hover:bg-slate-50"
        >
          {cta}
        </Link>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <MiniMetric label="Active OKRs" value={String(activeOkrCount)} />
          <MiniMetric label="Updated this week" value={String(updatedOkrCount)} />
          <MiniMetric label="Need check-in" value={String(needsCheckInOkrCount)} />
        </div>
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink-950">{value}</p>
    </div>
  );
}

function QuickActionsCard() {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-ink-950">Quick Actions</h2>
        <p className="mt-1 text-sm text-ink-600">Start the next OKR operating step.</p>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Link
          href="/okrs/new"
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-dten-blue bg-dten-blue px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Create OKR
        </Link>
        <Link
          href="/weekly-update"
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-ink-800 transition hover:bg-slate-50"
        >
          Complete Weekly Update
        </Link>
      </CardContent>
    </Card>
  );
}

function DashboardStat({ label, value }: { label: string; value: string; tone: StatTone }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-sm font-medium text-ink-600">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-ink-950">{value}</p>
      </CardContent>
    </Card>
  );
}

function OkrSummaryCard({
  title,
  objectives: cardObjectives,
  allObjectives = cardObjectives,
  keyResults: cardKeyResults = [],
  compact = false,
  showKrPreview = false,
}: {
  title: string;
  objectives: Objective[];
  allObjectives?: Objective[];
  keyResults?: KeyResult[];
  compact?: boolean;
  showKrPreview?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-950">{title}</h2>
            <p className="mt-1 text-sm text-ink-600">Score, Status, and Confidence are shown as separate signals.</p>
          </div>
          <Badge tone="neutral">{cardObjectives.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {cardObjectives.length === 0 ? (
          <EmptyState title="No OKRs" description="Nothing to show for this role and mock user." />
        ) : (
          cardObjectives.slice(0, compact ? 4 : 6).map((objective) => (
            <Link key={objective.id} href={`/okrs/${objective.id}`} className="block rounded-lg border border-slate-200 p-4 hover:bg-blue-50/30">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="info">Objective</Badge>
                    <p className="min-w-0 max-w-[calc(100vw-6rem)] break-words font-semibold text-ink-950 md:max-w-none">{objective.title}</p>
                  </div>
                  <ParentAlignmentText objective={objective} allObjectives={allObjectives} />
                  <p className="mt-1 text-sm text-ink-600">
                    {findDepartment(objective.departmentId)?.name ?? "No department"} / {findTeam(objective.teamId)?.name ?? "No team"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge status={objective.status} />
                    <ConfidenceBadge confidence={objective.confidence} />
                    <ApprovalStateBadge approvalState={objective.approvalState} />
                    <VisibilityBadge visibility={objective.visibility} />
                    <AlignmentBadge linked={Boolean(objective.parentObjectiveId)} />
                  </div>
                  {showKrPreview ? <KrPreview objectiveId={objective.id} keyResults={cardKeyResults} /> : null}
                  <p className="mt-3 text-sm font-semibold text-dten-blue">{showKrPreview ? "View details and KRs" : "View details"}</p>
                </div>
                <div className="w-full xl:w-44">
                  <ProgressBar value={objective.score} label="Score" />
                </div>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ParentAlignmentText({ objective, allObjectives }: { objective: Objective; allObjectives: Objective[] }) {
  if (!objective.parentObjectiveId) {
    return null;
  }

  const parentObjective = allObjectives.find((item) => item.id === objective.parentObjectiveId);

  return (
    <p className="mt-2 line-clamp-2 max-w-[calc(100vw-6rem)] break-words text-xs font-semibold uppercase tracking-wide text-dten-blue md:max-w-none">
      {parentObjective ? `Parent: ${parentObjective.title}` : "Parent objective restricted"}
    </p>
  );
}

function KrPreview({ objectiveId, keyResults: allKeyResults }: { objectiveId: string; keyResults: KeyResult[] }) {
  const objectiveKeyResults = allKeyResults.filter((keyResult) => keyResult.objectiveId === objectiveId);

  if (objectiveKeyResults.length === 0) {
    return <p className="mt-3 text-sm font-semibold text-dten-blue">View KRs</p>;
  }

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Key Results</p>
        <Badge tone="neutral">{objectiveKeyResults.length}</Badge>
      </div>
      <div className="mt-2 space-y-2">
        {objectiveKeyResults.slice(0, 2).map((keyResult) => (
          <div key={keyResult.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <p className="min-w-0 break-words text-sm text-ink-700 sm:truncate">{keyResult.title}</p>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs font-semibold text-ink-600">{keyResult.progressPercent}%</span>
              <StatusBadge status={keyResult.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommentsCard({ title, comments: cardComments }: { title: string; comments: Comment[] }) {
  return (
    <SimpleListCard
      title={title}
      emptyTitle="No recent comments"
      items={cardComments.map((comment) => ({
        id: comment.id,
        title: findUser(comment.authorUserId)?.name ?? "Unknown user",
        meta: comment.body,
      }))}
    />
  );
}

function NotificationsCard({ notifications: cardNotifications }: { notifications: Notification[] }) {
  return (
    <SimpleListCard
      title="Recent Notifications"
      emptyTitle="No recent notifications"
      items={cardNotifications.map((notification) => ({
        id: notification.id,
        title: labelNotification(notification.type),
        meta: notification.status,
      }))}
    />
  );
}

function SimpleListCard({ title, emptyTitle, items }: { title: string; emptyTitle: string; items: { id: string; title: string; meta: string }[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink-950">{title}</h2>
          <Badge tone="neutral">{items.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <EmptyState title={emptyTitle} description="This section is based on mock dashboard data." />
        ) : (
          items.slice(0, 5).map((item) => (
            <div key={item.id} className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-sm font-semibold text-ink-950">{item.title}</p>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-600">{item.meta}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function PlaceholderCard({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-ink-950">{title}</h2>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-ink-600">{body}</p>
      </CardContent>
    </Card>
  );
}

function AdminTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">{label}</p>
      <p className="mt-2 text-lg font-semibold text-ink-950">{value}</p>
    </div>
  );
}

function getDirectReports(managerId: string) {
  return usersForHome().filter((user) => user.primaryManagerId === managerId);
}

function getManagerComments(user: User, userVisibleObjectives: Objective[], reports: WeeklyReport[]) {
  const managerIds = [user.primaryManagerId, user.localManagerId].filter(Boolean);
  const relevantObjectiveIds = userVisibleObjectives.filter((objective) => objective.ownerUserId === user.id).map((objective) => objective.id);
  const reportIds = reports.filter((report) => report.userId === user.id).map((report) => report.id);

  return comments.filter((comment) => {
    return (
      managerIds.includes(comment.authorUserId) &&
      (relevantObjectiveIds.includes(comment.resourceId) || reportIds.includes(comment.resourceId))
    );
  });
}

function getLatestReport(userId: string, reports: WeeklyReport[]) {
  return reports
    .filter((report) => report.userId === userId)
    .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))[0];
}

function usersWithoutPrimaryManager() {
  return usersForHome().filter((user) => !user.primaryManagerId);
}

function usersForHome() {
  return users;
}

function labelNotification(type: string) {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getLatestMockWeek(reports: WeeklyReport[]) {
  const latestReport = [...reports].sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))[0];

  if (!latestReport) {
    return getCurrentWeek();
  }

  return {
    week_start_date: latestReport.weekStartDate,
    week_end_date: latestReport.weekEndDate,
  };
}

function formatWeekRange(start: string, end: string) {
  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}
