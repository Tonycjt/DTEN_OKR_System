"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { OkrDetailDrawer } from "@/components/okrs/okr-detail-drawer";
import { KRMonthlyPacingSummary } from "@/components/okrs/kr-monthly-pacing";
import { createEmptyLocalOkrStore, loadLocalOkrStore } from "@/lib/local-okr-store";
import { deriveKRPacingStatus } from "@/lib/kr-monthly-checkpoints";
import { mergeById } from "@/lib/merge-by-id";
import { mockCurrentDate } from "@/lib/mock-current-date";
import { averageObjectiveScore, formatBreakdown, objectiveBreakdown } from "@/lib/okr-metrics";
import { checkIns, departments, keyResults, objectives, okrChangeRequests, quarters, teams, users, weeklyReports } from "@/mock-data";
import { useMockSessionUser } from "@/lib/mock-session";
import { canViewObjective, canViewWeeklyReport } from "@/lib/permission-helpers";
import { getAdHocPriorities, getPrioritiesLinkedToKeyResults } from "@/lib/weekly-priority-helpers";
import { getCurrentWeek, getWeeklyUpdateCompliance } from "@/lib/weekly-execution";
import type { KeyResult, Objective, OkrChangeRequest, User, WeeklyReport } from "@/types";

type OrgDashboardMode = "company" | "departments" | "teams";
type StatTone = "neutral" | "success" | "warning" | "danger" | "info";

export function OrgDashboardView({ mode }: { mode: OrgDashboardMode }) {
  const activeUser = useMockSessionUser();
  const [store, setStore] = useState(() => createEmptyLocalOkrStore());
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string | null>(null);

  useEffect(() => {
    const refreshStore = () => setStore(loadLocalOkrStore());
    refreshStore();
    window.addEventListener("dten-local-okrs-updated", refreshStore);

    return () => window.removeEventListener("dten-local-okrs-updated", refreshStore);
  }, []);

  const mergedObjectives = useMemo(() => mergeById(objectives, store.objectives), [store.objectives]);
  const mergedKeyResults = useMemo(() => mergeById(keyResults, store.keyResults), [store.keyResults]);
  const mergedCheckIns = useMemo(() => mergeById(checkIns, store.checkIns), [store.checkIns]);
  const mergedWeeklyReports = useMemo(() => mergeById(weeklyReports, store.weeklyReports), [store.weeklyReports]);
  const mergedChangeRequests = useMemo(() => mergeById(okrChangeRequests, store.okrChangeRequests), [store.okrChangeRequests]);
  const visibleObjectives = useMemo(() => {
    return mergedObjectives.filter((objective) =>
      canViewObjective(activeUser, objective, {
        users,
        objectives: mergedObjectives,
        keyResults: mergedKeyResults,
      }),
    );
  }, [activeUser, mergedKeyResults, mergedObjectives]);

  const week = getLatestMockWeek(mergedWeeklyReports);
  const activeQuarterId = quarters.find((quarter) => quarter.isActive)?.id ?? quarters[0].id;

  if (mode === "company") {
    return (
      <>
      <CompanyDashboard
        activeUser={activeUser}
        objectives={visibleObjectives}
        keyResults={mergedKeyResults}
        checkIns={mergedCheckIns}
        week={week}
        quarterId={activeQuarterId}
        weeklyReports={mergedWeeklyReports}
        changeRequests={mergedChangeRequests}
        onOpenObjective={setSelectedObjectiveId}
      />
      <OkrDetailDrawer objectiveId={selectedObjectiveId} onClose={() => setSelectedObjectiveId(null)} />
      </>
    );
  }

  if (mode === "departments") {
    return (
      <>
      <DepartmentDashboard
        activeUser={activeUser}
        objectives={visibleObjectives}
        keyResults={mergedKeyResults}
        checkIns={mergedCheckIns}
        week={week}
        quarterId={activeQuarterId}
        weeklyReports={mergedWeeklyReports}
        onOpenObjective={setSelectedObjectiveId}
      />
      <OkrDetailDrawer objectiveId={selectedObjectiveId} onClose={() => setSelectedObjectiveId(null)} />
      </>
    );
  }

  return (
    <>
    <TeamDashboard
      activeUser={activeUser}
      objectives={visibleObjectives}
      checkIns={mergedCheckIns}
      keyResults={mergedKeyResults}
      weeklyReports={mergedWeeklyReports}
      week={week}
      quarterId={activeQuarterId}
      onOpenObjective={setSelectedObjectiveId}
    />
    <OkrDetailDrawer objectiveId={selectedObjectiveId} onClose={() => setSelectedObjectiveId(null)} />
    </>
  );
}

function CompanyDashboard({
  activeUser,
  objectives: visibleObjectives,
  keyResults: mergedKeyResults,
  checkIns: mergedCheckIns,
  weeklyReports: mergedWeeklyReports,
  changeRequests,
  week,
  quarterId,
  onOpenObjective,
}: {
  activeUser: User;
  objectives: Objective[];
  keyResults: KeyResult[];
  checkIns: typeof checkIns;
  weeklyReports: WeeklyReport[];
  changeRequests: OkrChangeRequest[];
  week: { week_start_date: string; week_end_date: string };
  quarterId: string;
  onOpenObjective: (objectiveId: string) => void;
}) {
  const scopedObjectives = visibleObjectives.filter((objective) => objective.quarterId === quarterId);
  const activeObjectives = scopedObjectives.filter((objective) => objective.isActive);
  const approvedObjectives = scopedObjectives.filter((objective) => objective.approvalState === "Approved");
  const linkedCount = activeObjectives.filter((objective) => objective.parentObjectiveId).length;
  const unlinkedCount = activeObjectives.length - linkedCount;
  const autoUpdatedParentKrs = mergedKeyResults.filter((keyResult) => keyResult.rollupMode === "Auto from linked child objective").length;
  const pacingSummary = getPacingSummary(activeObjectives, mergedKeyResults);
  const activeOwnerIds = new Set(activeObjectives.map((objective) => objective.ownerUserId));
  const weeklyReportSummary = getWeeklyReportAggregateSummary({
    activeOwnerIds,
    weeklyReports: mergedWeeklyReports,
    week,
  });
  const priorityMix = getWeeklyPriorityMix(weeklyReportSummary.reports);
  const visibleObjectiveIds = new Set(scopedObjectives.map((objective) => objective.id));
  const pendingChangeRequestCount = changeRequests.filter(
    (changeRequest) => changeRequest.status === "pending" && visibleObjectiveIds.has(changeRequest.objectiveId),
  ).length;
  const atRiskAreas = departments
    .map((department) => {
      const departmentObjectives = activeObjectives.filter((objective) => objective.departmentId === department.id);
      return {
        id: department.id,
        name: department.name,
        count: departmentObjectives.filter((objective) => objective.status === "At Risk" || objective.status === "Off Track").length,
      };
    })
    .filter((item) => item.count > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company"
        description={`Company OKR visibility for ${activeUser.name}. Leadership sees records allowed by current visibility settings, not admin-only detail.`}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardStat label="Total active OKRs" value={String(activeObjectives.length)} tone="success" />
        <DashboardStat label="Total approved OKRs" value={String(approvedObjectives.length)} tone="neutral" />
        <DashboardStat label="Average score" value={`${averageObjectiveScore(activeObjectives)}%`} tone="info" />
        <DashboardStat label="Weekly compliance" value={`${getWeeklyUpdateCompliance({ users, objectives: visibleObjectives, checkIns: mergedCheckIns, week, quarterId })}%`} tone="success" />
        <DashboardStat label="% KRs on pace by monthly target" value={`${pacingSummary.onPacePercent}%`} tone="success" />
        <DashboardStat label="% targeted KRs behind monthly target" value={`${pacingSummary.behindPercent}%`} tone={pacingSummary.behindCount > 0 ? "warning" : "success"} />
        <DashboardStat label="Weekly update submission rate" value={`${weeklyReportSummary.submissionRate}%`} tone={weeklyReportSummary.submissionRate >= 80 ? "success" : "warning"} />
        <DashboardStat label="Weekly updates reviewed by managers" value={`${weeklyReportSummary.reviewedRate}%`} tone={weeklyReportSummary.reviewedRate >= 80 ? "success" : "warning"} />
        <DashboardStat label="Linked KR priorities vs ad hoc" value={`${priorityMix.linkedCount}/${priorityMix.adHocCount}`} tone={priorityMix.adHocCount > priorityMix.linkedCount ? "warning" : "info"} />
        <DashboardStat label="Pending OKR change requests" value={String(pendingChangeRequestCount)} tone={pendingChangeRequestCount > 0 ? "warning" : "success"} />
        <DashboardStat label="At-risk / off-track OKRs" value={String(activeObjectives.filter((objective) => objective.status === "At Risk" || objective.status === "Off Track").length)} tone={activeObjectives.some((objective) => objective.status === "At Risk" || objective.status === "Off Track") ? "warning" : "success"} />
      </div>

      <LeadershipExecutionAggregateCard
        pacingSummary={pacingSummary}
        weeklyReportSummary={weeklyReportSummary}
        priorityMix={priorityMix}
        pendingChangeRequestCount={pendingChangeRequestCount}
        atRiskCount={activeObjectives.filter((objective) => objective.status === "At Risk" || objective.status === "Off Track").length}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <BreakdownCard title="Status Breakdown" items={objectiveBreakdown(activeObjectives, "status")} />
        <BreakdownCard title="Confidence Breakdown" items={objectiveBreakdown(activeObjectives, "confidence")} />
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-ink-950">Alignment Coverage</h2>
            <p className="mt-1 text-sm text-ink-600">Linked and unlinked objective alignment only.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProgressBar value={Math.round((linkedCount / Math.max(activeObjectives.length, 1)) * 100)} label="Linked OKRs" />
            <div className="flex flex-wrap gap-2">
              <Badge tone="info">{linkedCount} linked</Badge>
              <Badge tone="neutral">{unlinkedCount} unlinked</Badge>
              <Badge tone="neutral">{autoUpdatedParentKrs} auto-updated parent KRs</Badge>
            </div>
            <p className="text-sm leading-6 text-ink-600">Alignment links are visibility-only. KR contribution roll-up is tracked separately.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <SimpleListCard
          title="At-risk Areas"
          emptyTitle="No at-risk areas"
          items={atRiskAreas.map((area) => ({ id: area.id, title: area.name, meta: `${area.count} at-risk/off-track OKRs` }))}
        />
        <DepartmentSummaryTable objectives={visibleObjectives} keyResults={mergedKeyResults} checkIns={mergedCheckIns} weeklyReports={mergedWeeklyReports} week={week} quarterId={quarterId} />
      </div>

      <PacingSummaryCard title="Monthly KR Pacing by Department / Team" objectives={activeObjectives} keyResults={mergedKeyResults} />

      <AlignmentTreeCard title="Company Alignment" objectives={activeObjectives} />
      <OkrTable
        title="Company OKRs"
        objectives={activeObjectives}
        keyResults={mergedKeyResults}
        visibleObjectives={visibleObjectives}
        onOpenObjective={onOpenObjective}
      />
    </div>
  );
}

function DepartmentDashboard({
  objectives: visibleObjectives,
  keyResults: mergedKeyResults,
  checkIns: mergedCheckIns,
  weeklyReports: mergedWeeklyReports,
  week,
  quarterId,
  onOpenObjective,
}: {
  activeUser: User;
  objectives: Objective[];
  keyResults: KeyResult[];
  checkIns: typeof checkIns;
  weeklyReports: WeeklyReport[];
  week: { week_start_date: string; week_end_date: string };
  quarterId: string;
  onOpenObjective: (objectiveId: string) => void;
}) {
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");
  const departmentSummaries = departments.map((department) => {
    const departmentObjectives = visibleObjectives.filter((objective) => objective.departmentId === department.id && objective.quarterId === quarterId);
    const departmentUsers = users.filter((user) => user.departmentId === department.id);
    return {
      department,
      objectives: departmentObjectives,
      activeCount: departmentObjectives.filter((objective) => objective.isActive).length,
      atRiskCount: departmentObjectives.filter((objective) => objective.status === "At Risk" || objective.status === "Off Track").length,
      compliance: getWeeklyUpdateCompliance({ users: departmentUsers, objectives: visibleObjectives, checkIns: mergedCheckIns, week, quarterId }),
    };
  });
  const selectedDepartment =
    departmentSummaries.find((summary) => summary.department.id === selectedDepartmentId) ??
    departmentSummaries.find((summary) => summary.objectives.length > 0) ??
    departmentSummaries[0];
  const departmentTeams = teams.filter((team) => team.departmentId === selectedDepartment.department.id);
  const atRiskOkrs = selectedDepartment.objectives.filter((objective) => objective.status === "At Risk" || objective.status === "Off Track");
  const linkedCount = selectedDepartment.objectives.filter((objective) => objective.parentObjectiveId).length;
  const unlinkedCount = selectedDepartment.objectives.length - linkedCount;

  return (
    <div className="space-y-6">
      <PageHeader title="Departments" description="Department and function summaries based on visible OKRs, status, confidence, and weekly update signals." />

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-ink-950">Department Summary</h2>
          <p className="mt-1 text-sm text-ink-600">Choose a visible department or function to review status, confidence, risks, and weekly update signals.</p>
        </CardHeader>
        <CardContent className="max-w-sm">
          <SelectField label="Department / function" value={selectedDepartment.department.id} onChange={setSelectedDepartmentId}>
            {departmentSummaries.map((summary) => (
              <option key={summary.department.id} value={summary.department.id}>
                {summary.department.name}
              </option>
            ))}
          </SelectField>
        </CardContent>
      </Card>

      <DepartmentSummaryTable objectives={visibleObjectives} keyResults={mergedKeyResults} checkIns={mergedCheckIns} weeklyReports={mergedWeeklyReports} week={week} quarterId={quarterId} />

      <div className="grid gap-4 xl:grid-cols-4">
        <DashboardStat label="Department OKRs" value={String(selectedDepartment.objectives.length)} tone="neutral" />
        <DashboardStat label="Active OKRs" value={String(selectedDepartment.activeCount)} tone="success" />
        <DashboardStat label="Weekly compliance" value={`${selectedDepartment.compliance}%`} tone="success" />
        <DashboardStat label="Linked / unlinked" value={`${linkedCount}/${unlinkedCount}`} tone="info" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <BreakdownCard title="Department Status" items={objectiveBreakdown(selectedDepartment.objectives, "status")} />
        <BreakdownCard title="Department Confidence" items={objectiveBreakdown(selectedDepartment.objectives, "confidence")} />
        <SimpleListCard
          title="At-risk OKRs"
          emptyTitle="No at-risk OKRs"
          items={atRiskOkrs.map((objective) => ({
            id: objective.id,
            title: objective.title,
            meta: `${objective.status} / ${objective.confidence} confidence`,
            href: `/okrs/${objective.id}`,
          }))}
        />
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-ink-950">Team Roll-up Summary</h2>
          <p className="mt-1 text-sm text-ink-600">Simple team summaries for the first visible department with OKRs.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs font-semibold uppercase tracking-wide text-ink-600">
              <tr>
                <th className="py-2 pr-4">Team</th>
                <th className="py-2 pr-4">OKRs</th>
                <th className="py-2 pr-4">Average score</th>
                <th className="py-2 pr-4">At risk</th>
                <th className="py-2 pr-4">Weekly compliance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {departmentTeams.map((team) => {
                const teamObjectives = visibleObjectives.filter((objective) => objective.teamId === team.id && objective.quarterId === quarterId);
                const teamUsers = users.filter((user) => user.teamId === team.id);
                return (
                  <tr key={team.id}>
                    <td className="py-3 pr-4 font-semibold text-ink-950">{team.name}</td>
                    <td className="py-3 pr-4 text-ink-600">{teamObjectives.length}</td>
                    <td className="py-3 pr-4 text-ink-600">{averageObjectiveScore(teamObjectives)}%</td>
                    <td className="py-3 pr-4 text-ink-600">{teamObjectives.filter((objective) => objective.status === "At Risk" || objective.status === "Off Track").length}</td>
                    <td className="py-3 pr-4 text-ink-600">{getWeeklyUpdateCompliance({ users: teamUsers, objectives: visibleObjectives, checkIns: mergedCheckIns, week, quarterId })}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <AlignmentTreeCard title="Department Alignment" objectives={selectedDepartment.objectives} allVisibleObjectives={visibleObjectives} />
      <OkrTable
        title="Department OKRs"
        objectives={selectedDepartment.objectives}
        keyResults={mergedKeyResults}
        visibleObjectives={visibleObjectives}
        onOpenObjective={onOpenObjective}
      />
    </div>
  );
}

function TeamDashboard({
  activeUser,
  objectives: visibleObjectives,
  checkIns: mergedCheckIns,
  keyResults: mergedKeyResults,
  weeklyReports: mergedWeeklyReports,
  week,
  quarterId,
  onOpenObjective,
}: {
  activeUser: User;
  objectives: Objective[];
  checkIns: typeof checkIns;
  keyResults: KeyResult[];
  weeklyReports: WeeklyReport[];
  week: { week_start_date: string; week_end_date: string };
  quarterId: string;
  onOpenObjective: (objectiveId: string) => void;
}) {
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const teamSummaries = teams.map((team) => {
    const teamObjectives = visibleObjectives.filter((objective) => objective.teamId === team.id && objective.quarterId === quarterId);
    const teamUsers = users.filter((user) => user.teamId === team.id);
    return {
      team,
      users: teamUsers,
      objectives: teamObjectives,
      compliance: getWeeklyUpdateCompliance({ users: teamUsers, objectives: visibleObjectives, checkIns: mergedCheckIns, week, quarterId }),
    };
  });
  const selectedTeam =
    teamSummaries.find((summary) => summary.team.id === selectedTeamId) ??
    teamSummaries.find((summary) => summary.objectives.length > 0) ??
    teamSummaries[0];
  const pendingApprovals = selectedTeam.objectives.filter((objective) => objective.approvalState === "Pending Approval").length;
  const atRiskFlags = selectedTeam.objectives.filter((objective) => objective.status === "At Risk" || objective.status === "Off Track");
  const linkedCount = selectedTeam.objectives.filter((objective) => objective.parentObjectiveId).length;
  const selectedObjectiveIds = new Set(selectedTeam.objectives.map((objective) => objective.id));
  const timingSignalKeyResults = mergedKeyResults.filter((keyResult) => {
    return (
      selectedObjectiveIds.has(keyResult.objectiveId) &&
      keyResult.dueDate &&
      keyResult.dueDate < week.week_end_date &&
      keyResult.status !== "Completed"
    );
  });
  const latestReportItems = selectedTeam.users.map((user) => {
    const report = [...mergedWeeklyReports]
      .filter((item) => item.userId === user.id)
      .filter((item) =>
        canViewWeeklyReport(activeUser, item, {
          users,
          objectives: visibleObjectives,
          weeklyReportPolicy: { includeLocalManager: true },
        }),
      )
      .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))[0];
    return {
      id: user.id,
      title: user.name,
      meta: report ? `${report.okrUpdateStatus} / ${report.challengesComments ?? "No challenges"}` : "No weekly report",
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Teams" description="Team-level OKR summaries, member OKRs, weekly update signals, and lightweight risk flags." />

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-ink-950">Team Dashboard</h2>
          <p className="mt-1 text-sm text-ink-600">Choose a team to review OKRs, member updates, alignment, and weekly report signals.</p>
        </CardHeader>
        <CardContent className="max-w-sm">
          <SelectField label="Team" value={selectedTeam.team.id} onChange={setSelectedTeamId}>
            {teamSummaries.map((summary) => (
              <option key={summary.team.id} value={summary.team.id}>
                {summary.team.name}
              </option>
            ))}
          </SelectField>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardStat label="Team OKRs" value={String(selectedTeam.objectives.length)} tone="neutral" />
        <DashboardStat label="Pending approvals" value={String(pendingApprovals)} tone="warning" />
        <DashboardStat label="Weekly compliance" value={`${selectedTeam.compliance}%`} tone="success" />
        <DashboardStat label="Linked / unlinked" value={`${linkedCount}/${selectedTeam.objectives.length - linkedCount}`} tone="info" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <OkrTable
          title="Team OKRs"
          objectives={selectedTeam.objectives.filter((objective) => objective.level === "team")}
          keyResults={mergedKeyResults}
          visibleObjectives={visibleObjectives}
          onOpenObjective={onOpenObjective}
        />
        <OkrTable
          title="Member OKRs"
          objectives={selectedTeam.objectives.filter((objective) => objective.level === "individual")}
          keyResults={mergedKeyResults}
          visibleObjectives={visibleObjectives}
          onOpenObjective={onOpenObjective}
        />
      </div>

      <AlignmentTreeCard title="Team Alignment" objectives={selectedTeam.objectives} allVisibleObjectives={visibleObjectives} />

      <div className="grid gap-4 xl:grid-cols-2">
        <SimpleListCard
          title="Latest Weekly Report Previews"
          emptyTitle="No weekly reports"
          items={latestReportItems}
        />
        <SimpleListCard
          title="At-risk and Off-track Flags"
          emptyTitle="No at-risk flags"
          items={[
            ...atRiskFlags.map((objective) => ({
              id: objective.id,
              title: objective.title,
              meta: `${objective.status} / ${objective.confidence} confidence`,
              href: `/okrs/${objective.id}`,
            })),
            ...timingSignalKeyResults.map((keyResult) => ({
              id: keyResult.id,
              title: keyResult.title,
              meta: `Timing signal / ${keyResult.status} / checkpoint ${formatDate(keyResult.dueDate ?? week.week_end_date)}`,
              href: `/okrs/${keyResult.objectiveId}`,
            })),
          ]}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SimpleListCard
          title="Linked OKRs"
          emptyTitle="No linked OKRs"
          items={selectedTeam.objectives
            .filter((objective) => objective.parentObjectiveId)
            .map((objective) => ({
              id: objective.id,
              title: objective.title,
              meta: `${objective.status} status / ${objective.score}% score / ${objective.confidence} confidence`,
              href: `/okrs/${objective.id}`,
            }))}
        />
        <SimpleListCard
          title="Unlinked OKRs"
          emptyTitle="No unlinked OKRs"
          items={selectedTeam.objectives
            .filter((objective) => !objective.parentObjectiveId)
            .map((objective) => ({
              id: objective.id,
              title: objective.title,
              meta: `${objective.status} status / ${objective.score}% score / ${objective.confidence} confidence`,
              href: `/okrs/${objective.id}`,
            }))}
        />
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-ink-950">Team Summary Table</h2>
          <p className="mt-1 text-sm text-ink-600">Simple team summaries across visible OKRs.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs font-semibold uppercase tracking-wide text-ink-600">
              <tr>
                <th className="py-2 pr-4">Team</th>
                <th className="py-2 pr-4">OKRs</th>
                <th className="py-2 pr-4">Member OKRs</th>
                <th className="py-2 pr-4">Pending approvals</th>
                <th className="py-2 pr-4">Weekly compliance</th>
                <th className="py-2 pr-4">At-risk flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teamSummaries.map((summary) => (
                <tr key={summary.team.id}>
                  <td className="py-3 pr-4 font-semibold text-ink-950">{summary.team.name}</td>
                  <td className="py-3 pr-4 text-ink-600">{summary.objectives.length}</td>
                  <td className="py-3 pr-4 text-ink-600">{summary.objectives.filter((objective) => objective.level === "individual").length}</td>
                  <td className="py-3 pr-4 text-ink-600">{summary.objectives.filter((objective) => objective.approvalState === "Pending Approval").length}</td>
                  <td className="py-3 pr-4 text-ink-600">{summary.compliance}%</td>
                  <td className="py-3 pr-4 text-ink-600">{summary.objectives.filter((objective) => objective.status === "At Risk" || objective.status === "Off Track").length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function PacingSummaryCard({ title, objectives: visibleObjectives, keyResults: mergedKeyResults }: { title: string; objectives: Objective[]; keyResults: KeyResult[] }) {
  const departmentRows = departments.map((department) => {
    const departmentObjectives = visibleObjectives.filter((objective) => objective.departmentId === department.id);
    const summary = getPacingSummary(departmentObjectives, mergedKeyResults);

    return {
      id: department.id,
      group: department.name,
      scope: "Department",
      onPacePercent: summary.onPacePercent,
      behindCount: summary.behindCount,
      totalKrs: summary.totalCount,
    };
  });
  const teamRows = teams.map((team) => {
    const teamObjectives = visibleObjectives.filter((objective) => objective.teamId === team.id);
    const summary = getPacingSummary(teamObjectives, mergedKeyResults);

    return {
      id: team.id,
      group: team.name,
      scope: "Team",
      onPacePercent: summary.onPacePercent,
      behindCount: summary.behindCount,
      totalKrs: summary.totalCount,
    };
  });
  const rows = [...departmentRows, ...teamRows].filter((row) => row.totalKrs > 0 || row.behindCount > 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-950">{title}</h2>
            <p className="mt-1 text-sm text-ink-600">High-level pacing signal from visible KRs with monthly targets. This is not a performance rating.</p>
          </div>
          <Badge tone="info">Visibility-safe aggregate</Badge>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState title="No monthly pacing data" description="Monthly checkpoint summaries appear once visible KRs have monthly targets." />
        ) : (
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-xs font-semibold uppercase tracking-wide text-ink-600">
              <tr>
                <th className="py-2 pr-4">Scope</th>
                <th className="py-2 pr-4">Department / team</th>
                <th className="py-2 pr-4">% targeted KRs on pace</th>
                <th className="py-2 pr-4">Behind monthly target</th>
                <th className="py-2 pr-4">Targeted KRs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={`${row.scope}-${row.id}`}>
                  <td className="py-3 pr-4 text-ink-600">{row.scope}</td>
                  <td className="py-3 pr-4 font-semibold text-ink-950">{row.group}</td>
                  <td className="py-3 pr-4 text-ink-600">{row.onPacePercent}%</td>
                  <td className="py-3 pr-4">
                    <Badge tone={row.behindCount > 0 ? "warning" : "success"}>{row.behindCount}</Badge>
                  </td>
                  <td className="py-3 pr-4 text-ink-600">{row.totalKrs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function DepartmentSummaryTable({
  objectives: visibleObjectives,
  keyResults: mergedKeyResults,
  checkIns: mergedCheckIns,
  weeklyReports: mergedWeeklyReports,
  week,
  quarterId,
}: {
  objectives: Objective[];
  keyResults: KeyResult[];
  checkIns: typeof checkIns;
  weeklyReports: WeeklyReport[];
  week: { week_start_date: string; week_end_date: string };
  quarterId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-ink-950">Department / Function Summary</h2>
        <p className="mt-1 text-sm text-ink-600">Visible OKR counts, scores, risks, and weekly update compliance.</p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="text-xs font-semibold uppercase tracking-wide text-ink-600">
            <tr>
              <th className="py-2 pr-4">Department</th>
              <th className="py-2 pr-4">Active OKRs</th>
              <th className="py-2 pr-4">Approved</th>
              <th className="py-2 pr-4">Average score</th>
              <th className="py-2 pr-4">At risk</th>
              <th className="py-2 pr-4">Behind monthly target</th>
              <th className="py-2 pr-4">Confidence</th>
              <th className="py-2 pr-4">Weekly compliance</th>
              <th className="py-2 pr-4">Latest reports</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {departments.map((department) => {
              const departmentObjectives = visibleObjectives.filter((objective) => objective.departmentId === department.id && objective.quarterId === quarterId);
              const departmentPacing = getPacingSummary(departmentObjectives.filter((objective) => objective.isActive), mergedKeyResults);
              const departmentUsers = users.filter((user) => user.departmentId === department.id);
              const departmentUserIds = new Set(departmentUsers.map((user) => user.id));
              const latestReportCount = mergedWeeklyReports.filter(
                (report) => departmentUserIds.has(report.userId) && report.weekStartDate === week.week_start_date,
              ).length;
              return (
                <tr key={department.id}>
                  <td className="py-3 pr-4 font-semibold text-ink-950">{department.name}</td>
                  <td className="py-3 pr-4 text-ink-600">{departmentObjectives.filter((objective) => objective.isActive).length}</td>
                  <td className="py-3 pr-4 text-ink-600">{departmentObjectives.filter((objective) => objective.approvalState === "Approved").length}</td>
                  <td className="py-3 pr-4 text-ink-600">{averageObjectiveScore(departmentObjectives)}%</td>
                  <td className="py-3 pr-4 text-ink-600">{departmentObjectives.filter((objective) => objective.status === "At Risk" || objective.status === "Off Track").length}</td>
                  <td className="py-3 pr-4 text-ink-600">{departmentPacing.behindCount}</td>
                  <td className="py-3 pr-4 text-ink-600">{formatBreakdown(objectiveBreakdown(departmentObjectives, "confidence"))}</td>
                  <td className="py-3 pr-4 text-ink-600">{getWeeklyUpdateCompliance({ users: departmentUsers, objectives: visibleObjectives, checkIns: mergedCheckIns, week, quarterId })}%</td>
                  <td className="py-3 pr-4 text-ink-600">
                    {latestReportCount}/{departmentUsers.length}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function LeadershipExecutionAggregateCard({
  pacingSummary,
  weeklyReportSummary,
  priorityMix,
  pendingChangeRequestCount,
  atRiskCount,
}: {
  pacingSummary: ReturnType<typeof getPacingSummary>;
  weeklyReportSummary: ReturnType<typeof getWeeklyReportAggregateSummary>;
  priorityMix: ReturnType<typeof getWeeklyPriorityMix>;
  pendingChangeRequestCount: number;
  atRiskCount: number;
}) {
  const rows = [
    {
      label: "Monthly KR pacing",
      value: `${pacingSummary.onPacePercent}% on pace / ${pacingSummary.behindPercent}% behind`,
      meta: `${pacingSummary.totalCount} KRs with monthly targets`,
      tone: pacingSummary.behindCount > 0 ? "warning" : "success",
    },
    {
      label: "Weekly update submission",
      value: `${weeklyReportSummary.submissionRate}% submitted`,
      meta: `${weeklyReportSummary.submittedCount}/${weeklyReportSummary.expectedCount} owners with visible active OKRs`,
      tone: weeklyReportSummary.submissionRate >= 80 ? "success" : "warning",
    },
    {
      label: "Manager review coverage",
      value: `${weeklyReportSummary.reviewedRate}% reviewed`,
      meta: `${weeklyReportSummary.reviewedCount}/${weeklyReportSummary.submittedCount} submitted updates reviewed or commented`,
      tone: weeklyReportSummary.reviewedRate >= 80 ? "success" : "warning",
    },
    {
      label: "Weekly priority mix",
      value: `${priorityMix.linkedCount} linked KR / ${priorityMix.adHocCount} ad hoc`,
      meta: `${priorityMix.totalCount} weekly priorities in submitted reports`,
      tone: priorityMix.adHocCount > priorityMix.linkedCount ? "warning" : "info",
    },
    {
      label: "Pending OKR change requests",
      value: String(pendingChangeRequestCount),
      meta: "Material changes waiting for manager decision",
      tone: pendingChangeRequestCount > 0 ? "warning" : "success",
    },
    {
      label: "At-risk / off-track OKRs",
      value: String(atRiskCount),
      meta: "Visible active OKRs with execution risk",
      tone: atRiskCount > 0 ? "warning" : "success",
    },
  ] satisfies Array<{ label: string; value: string; meta: string; tone: StatTone }>;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-950">Leadership Execution Signals</h2>
            <p className="mt-1 text-sm text-ink-600">
              Aggregate-only weekly execution health. Report text and employee-level detail stay behind normal visibility rules.
            </p>
          </div>
          <Badge tone="info">Aggregate only</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">{row.label}</p>
                <p className="mt-2 text-lg font-semibold text-ink-950">{row.value}</p>
                <p className="mt-1 text-sm leading-6 text-ink-600">{row.meta}</p>
              </div>
              <Badge tone={row.tone}>Signal</Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AlignmentTreeCard({
  title,
  objectives: scopedObjectives,
  allVisibleObjectives,
}: {
  title: string;
  objectives: Objective[];
  allVisibleObjectives?: Objective[];
}) {
  const visibleObjectives = allVisibleObjectives ?? scopedObjectives;
  const linkedObjectives = scopedObjectives.filter((objective) => objective.parentObjectiveId).slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-950">{title}</h2>
            <p className="mt-1 text-sm text-ink-600">Simple visibility-only parent objective links. No score roll-up is applied here.</p>
          </div>
          <Badge tone="info">{linkedObjectives.length} linked</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {linkedObjectives.length === 0 ? (
          <EmptyState title="No linked objectives" description="No visible objectives in this scope are linked to a parent objective." />
        ) : (
          linkedObjectives.map((objective) => {
            const parentObjective = visibleObjectives.find((item) => item.id === objective.parentObjectiveId);

            return (
              <div key={objective.id} className="rounded-md border border-slate-200 bg-white p-3">
                <div className="space-y-2">
                  {parentObjective ? (
                    <AlignmentNode objective={parentObjective} label="Parent" />
                  ) : (
                    <div className="rounded-md bg-slate-50 p-3">
                      <Badge tone="info">Parent</Badge>
                      <p className="mt-2 text-sm font-semibold text-ink-600">Linked parent objective restricted</p>
                    </div>
                  )}
                  <p className="pl-3 text-sm font-semibold text-ink-600">→</p>
                  <div className="ml-4">
                    <AlignmentNode objective={objective} label="Current" />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function AlignmentNode({ objective, label }: { objective: Objective; label: string }) {
  const owner = users.find((user) => user.id === objective.ownerUserId);

  return (
    <div className="rounded-md bg-slate-50 p-3">
      <div className="flex flex-wrap gap-2">
        <Badge tone="neutral">{label}</Badge>
        <Badge tone={objective.level === "company" ? "info" : objective.level === "individual" ? "neutral" : "success"}>
          {objective.level}
        </Badge>
      </div>
      <p className="mt-2 text-sm font-semibold leading-6 text-ink-950">{objective.title}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-600">Owner: {owner?.name ?? "Unknown owner"}</p>
    </div>
  );
}

function OkrTable({
  title,
  objectives: tableObjectives,
  keyResults: allKeyResults,
  visibleObjectives,
  onOpenObjective,
}: {
  title: string;
  objectives: Objective[];
  keyResults: KeyResult[];
  visibleObjectives: Objective[];
  onOpenObjective: (objectiveId: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink-950">{title}</h2>
          <Badge tone="neutral">{tableObjectives.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {tableObjectives.length === 0 ? (
          <EmptyState title="No OKRs" description="No visible OKRs match this dashboard scope." />
        ) : (
          tableObjectives.map((objective) => {
            const objectiveKeyResults = allKeyResults.filter((keyResult) => keyResult.objectiveId === objective.id);
            const parentObjective = objective.parentObjectiveId ? visibleObjectives.find((item) => item.id === objective.parentObjectiveId) : undefined;

            return (
            <button
              key={objective.id}
              type="button"
              onClick={() => onOpenObjective(objective.id)}
              className="block w-full rounded-lg border border-slate-200 p-4 text-left hover:bg-blue-50/30"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="info">Objective</Badge>
                    <p className="font-semibold text-ink-950">{objective.title}</p>
                    <Badge tone="neutral">{objectiveKeyResults.length} KR{objectiveKeyResults.length === 1 ? "" : "s"}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-600">
                    {getDepartmentName(objective.departmentId)} / {getTeamName(objective.teamId)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge status={objective.status} />
                    <ConfidenceBadge confidence={objective.confidence} />
                    <Badge tone={objective.parentObjectiveId ? "info" : "neutral"}>{objective.parentObjectiveId ? "Linked" : "Unlinked"}</Badge>
                  </div>
                  {parentObjective ? (
                    <p className="mt-2 line-clamp-2 text-xs font-semibold uppercase tracking-wide text-dten-blue">Parent: {parentObjective.title}</p>
                  ) : objective.parentObjectiveId ? (
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-600">Parent objective restricted</p>
                  ) : null}
                  {objectiveKeyResults.length > 0 ? (
                    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Key Results</p>
                        <p className="text-xs font-semibold uppercase tracking-wide text-dten-blue">View details</p>
                      </div>
                      <div className="mt-2 space-y-2">
                        {objectiveKeyResults.slice(0, 2).map((keyResult) => (
                          <div key={keyResult.id} className="rounded-md border border-slate-200 bg-white p-2">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <p className="min-w-0 truncate text-sm font-semibold text-ink-800">{keyResult.title}</p>
                              <div className="flex shrink-0 flex-wrap items-center gap-2">
                                <Badge tone="neutral">{keyResult.metricType}</Badge>
                                <StatusBadge status={keyResult.status} />
                                <span className="text-xs font-semibold text-ink-600">{keyResult.progressPercent}%</span>
                                {(keyResult.trackerLinks ?? []).length > 0 ? <Badge tone="info">{(keyResult.trackerLinks ?? []).length} link{(keyResult.trackerLinks ?? []).length === 1 ? "" : "s"}</Badge> : null}
                              </div>
                            </div>
                            <div className="mt-2">
                              <ProgressBar value={keyResult.progressPercent} label="KR quarterly progress" />
                            </div>
                            <div className="mt-2">
                              <KRMonthlyPacingSummary keyResult={keyResult} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="w-full lg:w-56">
                  <ProgressBar value={objective.score} label="Score" />
                </div>
              </div>
            </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function BreakdownCard({ title, items }: { title: string; items: { label: string; count: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-ink-950">{title}</h2>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-ink-600">No visible OKRs in this scope.</p>
        ) : (
          items.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-3">
              <span className="text-sm font-semibold text-ink-950">{item.label}</span>
              <Badge tone="neutral">{item.count}</Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function DashboardStat({ label, value, tone }: { label: string; value: string; tone: StatTone }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink-600">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-ink-950">{value}</p>
          </div>
          <Badge tone={tone}>Dashboard</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function SimpleListCard({
  title,
  emptyTitle,
  items,
}: {
  title: string;
  emptyTitle: string;
  items: { id: string; title: string; meta: string; href?: string }[];
}) {
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
          <EmptyState title={emptyTitle} description="No visible records match this dashboard scope." />
        ) : (
          items.slice(0, 6).map((item) => {
            const body = (
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-ink-950">{item.title}</p>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-600">{item.meta}</p>
              </div>
            );
            return item.href ? (
              <Link key={item.id} href={item.href} className="block hover:bg-blue-50/30">
                {body}
              </Link>
            ) : (
              <div key={item.id}>{body}</div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">{label}</span>
      <select
        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-ink-800 outline-none focus:border-dten-blue"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function getLatestMockWeek(reports: WeeklyReport[]) {
  const latestReport = [...reports].sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))[0];
  if (!latestReport) return getCurrentWeek();
  return {
    week_start_date: latestReport.weekStartDate,
    week_end_date: latestReport.weekEndDate,
  };
}

function getPacingSummary(visibleObjectives: Objective[], allKeyResults: KeyResult[]) {
  const visibleObjectiveIds = new Set(visibleObjectives.map((objective) => objective.id));
  const visibleKeyResults = allKeyResults.filter((keyResult) => visibleObjectiveIds.has(keyResult.objectiveId) && (keyResult.monthlyTargets?.length ?? 0) > 0);
  const statusCounts = visibleKeyResults.reduce(
    (counts, keyResult) => {
      const pacingStatus = deriveKRPacingStatus(keyResult, mockCurrentDate);
      if (pacingStatus === "Ahead" || pacingStatus === "On Pace") counts.onPace += 1;
      if (pacingStatus === "Behind") counts.behind += 1;
      return counts;
    },
    { onPace: 0, behind: 0 },
  );
  const totalCount = visibleKeyResults.length;

  return {
    totalCount,
    onPaceCount: statusCounts.onPace,
    behindCount: statusCounts.behind,
    onPacePercent: totalCount ? Math.round((statusCounts.onPace / totalCount) * 100) : 0,
    behindPercent: totalCount ? Math.round((statusCounts.behind / totalCount) * 100) : 0,
  };
}

function getWeeklyReportAggregateSummary({
  activeOwnerIds,
  weeklyReports: allWeeklyReports,
  week,
}: {
  activeOwnerIds: Set<string>;
  weeklyReports: WeeklyReport[];
  week: { week_start_date: string; week_end_date: string };
}) {
  const expectedCount = activeOwnerIds.size;
  const reports = allWeeklyReports.filter((report) => activeOwnerIds.has(report.userId) && report.weekStartDate === week.week_start_date);
  const submittedCount = reports.filter((report) => Boolean(report.submittedAt)).length;
  const reviewedCount = reports.filter((report) =>
    report.managerReviewStatus === "reviewed" ||
    report.managerReviewStatus === "commented" ||
    report.managerReviewStatus === "needs_follow_up" ||
    Boolean(report.reviewedAt),
  ).length;

  return {
    expectedCount,
    reports,
    submittedCount,
    reviewedCount,
    submissionRate: expectedCount ? Math.round((submittedCount / expectedCount) * 100) : 0,
    reviewedRate: submittedCount ? Math.round((reviewedCount / submittedCount) * 100) : 0,
  };
}

function getWeeklyPriorityMix(reports: WeeklyReport[]) {
  const linkedCount = reports.reduce((count, report) => count + getPrioritiesLinkedToKeyResults(report).length, 0);
  const adHocCount = reports.reduce((count, report) => count + getAdHocPriorities(report).length, 0);

  return {
    linkedCount,
    adHocCount,
    totalCount: linkedCount + adHocCount,
  };
}

function getDepartmentName(departmentId: string | null) {
  return departmentId ? departments.find((department) => department.id === departmentId)?.name ?? "No department" : "No department";
}

function getTeamName(teamId: string | null) {
  return teamId ? teams.find((team) => team.id === teamId)?.name ?? "No team" : "No team";
}
