"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Discussion } from "@/components/comments/discussion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { addLocalComment, addLocalNotification, createEmptyLocalOkrStore, loadLocalOkrStore, saveLocalOkrStore } from "@/lib/local-okr-store";
import { mergeById } from "@/lib/merge-by-id";
import { checkIns, comments, currentUser, keyResults, objectives, teams, users, weeklyReports } from "@/mock-data";
import { useMockSessionUser } from "@/lib/mock-session";
import { canViewWeeklyReport } from "@/lib/permission-helpers";
import { deriveOkrUpdateStatus, getActiveObjectivesForUser, getCheckInsForUserWeek, getCurrentWeek, getWeeklyReportForWeek } from "@/lib/weekly-execution";
import type { CheckIn, Comment, ManagerReviewStatus, Notification, OkrUpdateStatus, TrackerLink, User, WeeklyPriority, WeeklyReport } from "@/types";

const allValue = "All";
const updateStatuses: OkrUpdateStatus[] = ["No Active OKRs", "Not Updated", "Partially Updated", "Updated"];
const missingOptions = ["Submitted", "Missing"] as const;
const challengeOptions = ["Has challenges", "No challenges"] as const;

type HistoryTimelineItem = {
  id: string;
  user: User;
  weekStartDate: string;
  weekEndDate: string;
  report?: WeeklyReport;
  submittedStatus: "Submitted" | "Missing";
  okrUpdateStatus: OkrUpdateStatus;
  comments: Comment[];
  checkIns: CheckIn[];
};

export function WeeklyReportHistoryView() {
  const activeUser = useMockSessionUser();
  const [hasMounted, setHasMounted] = useState(false);
  const [store, setStore] = useState(() => createEmptyLocalOkrStore());
  const [employeeId, setEmployeeId] = useState(allValue);
  const [weekStartDate, setWeekStartDate] = useState(allValue);
  const [teamId, setTeamId] = useState(allValue);
  const [updateStatus, setUpdateStatus] = useState<OkrUpdateStatus | typeof allValue>(allValue);
  const [challengeFilter, setChallengeFilter] = useState<(typeof challengeOptions)[number] | typeof allValue>(allValue);
  const [missingFilter, setMissingFilter] = useState<(typeof missingOptions)[number] | typeof allValue>(allValue);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const displayUser = hasMounted ? activeUser : currentUser;
  const managerMode = displayUser.role === "Manager" || displayUser.role === "Admin";

  useEffect(() => {
    const refreshStore = () => setStore(loadLocalOkrStore());
    setHasMounted(true);
    refreshStore();
    window.addEventListener("dten-local-okrs-updated", refreshStore);

    return () => window.removeEventListener("dten-local-okrs-updated", refreshStore);
  }, []);

  const mergedReports = useMemo(() => mergeById(weeklyReports, store.weeklyReports), [store.weeklyReports]);
  const mergedComments = useMemo(() => mergeById(comments, store.comments), [store.comments]);
  const mergedCheckIns = useMemo(() => mergeById(checkIns, store.checkIns), [store.checkIns]);
  const mergedObjectives = useMemo(() => mergeById(objectives, store.objectives), [store.objectives]);
  const mergedKeyResults = useMemo(() => mergeById(keyResults, store.keyResults), [store.keyResults]);
  const scopedUsers = useMemo(() => getScopedUsers(displayUser), [displayUser]);
  const visibleReports = useMemo(() => {
    const scopedUserIds = new Set(scopedUsers.map((user) => user.id));

    return mergedReports
      .filter((report) => scopedUserIds.has(report.userId))
      .filter((report) =>
        canViewWeeklyReport(displayUser, report, {
          users,
          objectives: mergedObjectives,
          weeklyReportPolicy: { includeLocalManager: true },
        }),
      )
      .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate) || getUserName(a.userId).localeCompare(getUserName(b.userId)));
  }, [displayUser, mergedObjectives, mergedReports, scopedUsers]);

  const currentWeek = getCurrentWeek();
  const timelineItems = useMemo(() => {
    const reportItems: HistoryTimelineItem[] = visibleReports.map((report) => {
      const owner = users.find((user) => user.id === report.userId) ?? displayUser;
      const week = { week_start_date: report.weekStartDate, week_end_date: report.weekEndDate };
      return {
        id: report.id,
        user: owner,
        weekStartDate: report.weekStartDate,
        weekEndDate: report.weekEndDate,
        report,
        submittedStatus: "Submitted",
        okrUpdateStatus: report.okrUpdateStatus,
        comments: mergedComments.filter((comment) => comment.resourceType === "weekly_report" && comment.resourceId === report.id),
        checkIns: getCheckInsForUserWeek(report.userId, { checkIns: mergedCheckIns, objectives: mergedObjectives, week }),
      };
    });
    const reportKeys = new Set(visibleReports.map((report) => `${report.userId}:${report.weekStartDate}`));
    const missingItems: HistoryTimelineItem[] = scopedUsers
      .filter((user) => !reportKeys.has(`${user.id}:${currentWeek.week_start_date}`))
      .map((user) => {
        const activeObjectives = getActiveObjectivesForUser(user.id, { objectives: mergedObjectives, week: currentWeek });
        const userCheckIns = getCheckInsForUserWeek(user.id, { checkIns: mergedCheckIns, objectives: mergedObjectives, week: currentWeek });

        return {
          id: `missing:${user.id}:${currentWeek.week_start_date}`,
          user,
          weekStartDate: currentWeek.week_start_date,
          weekEndDate: currentWeek.week_end_date,
          submittedStatus: "Missing",
          okrUpdateStatus: deriveOkrUpdateStatus(activeObjectives, userCheckIns),
          comments: [],
          checkIns: userCheckIns,
        };
      });

    return [...missingItems, ...reportItems].sort(
      (a, b) => b.weekStartDate.localeCompare(a.weekStartDate) || a.user.name.localeCompare(b.user.name),
    );
  }, [currentWeek, displayUser, mergedCheckIns, mergedComments, mergedObjectives, scopedUsers, visibleReports]);

  const weekOptions = useMemo(() => {
    return Array.from(new Set(timelineItems.map((item) => item.weekStartDate))).sort((a, b) => b.localeCompare(a));
  }, [timelineItems]);
  const teamOptions = useMemo(() => {
    const scopedTeamIds = new Set(scopedUsers.map((user) => user.teamId));
    return teams.filter((team) => scopedTeamIds.has(team.id));
  }, [scopedUsers]);

  useEffect(() => {
    if (managerMode) {
      const scopedUserIds = new Set(scopedUsers.map((user) => user.id));
      const scopedTeamIds = new Set(teamOptions.map((team) => team.id));

      if (employeeId !== allValue && !scopedUserIds.has(employeeId)) {
        setEmployeeId(allValue);
      }

      if (teamId !== allValue && !scopedTeamIds.has(teamId)) {
        setTeamId(allValue);
      }

      if (weekStartDate !== allValue && !weekOptions.includes(weekStartDate)) {
        setWeekStartDate(allValue);
      }

      return;
    }

    setEmployeeId(allValue);
    setWeekStartDate(allValue);
    setTeamId(allValue);
    setUpdateStatus(allValue);
    setChallengeFilter(allValue);
    setMissingFilter(allValue);
  }, [employeeId, managerMode, scopedUsers, teamId, teamOptions, weekOptions, weekStartDate]);

  useEffect(() => {
    if (typeof window === "undefined" || !managerMode) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const requestedEmployeeId = params.get("employeeId");
    const requestedWeek = params.get("week");
    const requestedTeamId = params.get("teamId");
    const requestedUpdateStatus = params.get("updateStatus") as OkrUpdateStatus | null;
    const scopedUserIds = new Set(scopedUsers.map((user) => user.id));
    const scopedTeamIds = new Set(teamOptions.map((team) => team.id));

    if (requestedEmployeeId && scopedUserIds.has(requestedEmployeeId)) {
      setEmployeeId(requestedEmployeeId);
    }

    if (requestedWeek && weekOptions.includes(requestedWeek)) {
      setWeekStartDate(requestedWeek);
    }

    if (requestedTeamId && scopedTeamIds.has(requestedTeamId)) {
      setTeamId(requestedTeamId);
    }

    if (requestedUpdateStatus && updateStatuses.includes(requestedUpdateStatus)) {
      setUpdateStatus(requestedUpdateStatus);
    }
  }, [managerMode, scopedUsers, teamOptions, weekOptions]);

  const filteredItems = useMemo(() => {
    return timelineItems.filter((item) => {
      const hasChallenges = Boolean(item.report?.challengesComments);

      return (
        (employeeId === allValue || item.user.id === employeeId) &&
        (weekStartDate === allValue || item.weekStartDate === weekStartDate) &&
        (teamId === allValue || item.user.teamId === teamId) &&
        (updateStatus === allValue || item.okrUpdateStatus === updateStatus) &&
        (challengeFilter === allValue || (challengeFilter === "Has challenges" ? hasChallenges : !hasChallenges)) &&
        (missingFilter === allValue || item.submittedStatus === missingFilter)
      );
    });
  }, [challengeFilter, employeeId, missingFilter, teamId, timelineItems, updateStatus, weekStartDate]);

  const selectedItem = filteredItems.find((item) => item.id === selectedItemId) ?? filteredItems[0] ?? null;

  const currentWeekReports = scopedUsers.map((user) => ({
    user,
    report: getWeeklyReportForWeek(user.id, { weeklyReports: mergedReports, week: currentWeek }),
  }));
  const completedCurrentWeek = currentWeekReports.filter((item) => item.report?.submittedAt).length;
  const missedCurrentWeek = managerMode ? currentWeekReports.filter((item) => !item.report?.submittedAt) : [];
  const latestChallenges = managerMode
    ? visibleReports
        .filter((report) => Boolean(report.challengesComments))
        .slice(0, 5)
    : [];

  function addWeeklyReportComment(report: WeeklyReport, body: string, parentCommentId?: string | null) {
    if (
      !canViewWeeklyReport(displayUser, report, {
        users,
          objectives: mergedObjectives,
          weeklyReportPolicy: { includeLocalManager: true },
      })
    ) {
      setMessage("The selected mock user cannot comment on this weekly report.");
      return;
    }

    const parentComment = parentCommentId ? mergedComments.find((item) => item.id === parentCommentId) : undefined;
    if (parentCommentId && (!parentComment || parentComment.resourceType !== "weekly_report" || parentComment.resourceId !== report.id)) {
      setMessage("Reply must stay in the same weekly report discussion.");
      return;
    }

    const timestamp = new Date().toISOString();
    const comment: Comment = {
      id: `local-comment-${crypto.randomUUID()}`,
      resourceType: "weekly_report",
      resourceId: report.id,
      parentCommentId: parentCommentId ?? null,
      authorUserId: displayUser.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      body,
      archived: false,
    };
    const targetUserId = parentComment?.authorUserId ?? report.userId;
    let nextStore = addLocalComment(loadLocalOkrStore(), comment);

    if (targetUserId !== displayUser.id) {
      const notification: Notification = {
        id: `local-notification-${crypto.randomUUID()}`,
        userId: targetUserId,
        type: parentCommentId ? "comment_replied" : "comment_created",
        resourceType: "weekly_report",
        resourceId: report.id,
        channel: "in_app",
        sentAt: timestamp,
        readAt: null,
        status: "Sent",
      };
      nextStore = addLocalNotification(nextStore, notification);
    }

    saveLocalOkrStore(nextStore);
    setStore(nextStore);
    setMessage(parentCommentId ? "Reply added." : "Comment added.");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly Report History"
        description={getHeaderDescription(displayUser)}
        actions={
          <Link href="/weekly-update">
            <Button variant="secondary">Open Weekly Update</Button>
          </Link>
        }
      />

      {message ? <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-dten-blue">{message}</div> : null}

      {managerMode ? (
        <ManagerSummary
          completed={completedCurrentWeek}
          total={currentWeekReports.length}
          missed={missedCurrentWeek}
          latestChallenges={latestChallenges}
          weekStartDate={currentWeek.week_start_date}
          weekEndDate={currentWeek.week_end_date}
        />
      ) : null}

      {managerMode ? (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-ink-950">Filters</h2>
            <p className="mt-1 text-sm text-ink-600">Managers can review direct-report history beyond the current quarter.</p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SelectField label="Employee" value={employeeId} onChange={setEmployeeId}>
              <option>{allValue}</option>
              {scopedUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Week" value={weekStartDate} onChange={setWeekStartDate}>
              <option>{allValue}</option>
              {weekOptions.map((week) => (
                <option key={week} value={week}>
                  {formatDate(week)}
                </option>
              ))}
            </SelectField>
            <SelectField label="Team" value={teamId} onChange={setTeamId}>
              <option>{allValue}</option>
              {teamOptions.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Update status" value={updateStatus} onChange={(value) => setUpdateStatus(value as OkrUpdateStatus | typeof allValue)}>
              <option>{allValue}</option>
              {updateStatuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </SelectField>
            <SelectField label="Has challenges" value={challengeFilter} onChange={(value) => setChallengeFilter(value as (typeof challengeOptions)[number] | typeof allValue)}>
              <option>{allValue}</option>
              {challengeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </SelectField>
            <SelectField label="Missing update" value={missingFilter} onChange={(value) => setMissingFilter(value as (typeof missingOptions)[number] | typeof allValue)}>
              <option>{allValue}</option>
              {missingOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </SelectField>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-ink-950">Filters</h2>
            <p className="mt-1 text-sm text-ink-600">Filter your weekly update timeline without creating tasks or review records.</p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SelectField label="Week" value={weekStartDate} onChange={setWeekStartDate}>
              <option>{allValue}</option>
              {weekOptions.map((week) => (
                <option key={week} value={week}>
                  {formatDate(week)}
                </option>
              ))}
            </SelectField>
            <SelectField label="Status" value={updateStatus} onChange={(value) => setUpdateStatus(value as OkrUpdateStatus | typeof allValue)}>
              <option>{allValue}</option>
              {updateStatuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </SelectField>
            <SelectField label="Has challenges" value={challengeFilter} onChange={(value) => setChallengeFilter(value as (typeof challengeOptions)[number] | typeof allValue)}>
              <option>{allValue}</option>
              {challengeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </SelectField>
            <SelectField label="Missing update" value={missingFilter} onChange={(value) => setMissingFilter(value as (typeof missingOptions)[number] | typeof allValue)}>
              <option>{allValue}</option>
              {missingOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </SelectField>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <WeeklyTimelineList items={filteredItems} selectedItemId={selectedItem?.id ?? null} managerMode={managerMode} onSelect={setSelectedItemId} />
        <WeeklyHistoryDetail
          item={selectedItem}
          managerMode={managerMode}
          keyResults={mergedKeyResults}
          objectives={mergedObjectives}
          weeklyReports={mergedReports}
          canComment={Boolean(
            selectedItem?.report &&
              canViewWeeklyReport(displayUser, selectedItem.report, {
                users,
                objectives: mergedObjectives,
                weeklyReportPolicy: { includeLocalManager: true },
              }),
          )}
          onAddComment={(report, body, parentCommentId) => addWeeklyReportComment(report, body, parentCommentId)}
        />
      </div>
    </div>
  );
}

function ManagerSummary({
  completed,
  total,
  missed,
  latestChallenges,
  weekStartDate,
  weekEndDate,
}: {
  completed: number;
  total: number;
  missed: { user: User; report?: WeeklyReport }[];
  latestChallenges: WeeklyReport[];
  weekStartDate: string;
  weekEndDate: string;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.1fr_1.1fr]">
      <Card>
        <CardContent className="py-4">
          <p className="text-sm font-medium text-ink-600">Current week completion</p>
          <p className="mt-2 text-2xl font-semibold text-ink-950">
            {completed}/{total}
          </p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-600">Submitted reports</p>
          <p className="mt-2 text-sm text-ink-600">
            {formatDate(weekStartDate)} - {formatDate(weekEndDate)}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink-950">Missed Reports</h2>
            <Badge tone={missed.length > 0 ? "warning" : "success"}>{missed.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {missed.length === 0 ? (
            <p className="text-sm text-ink-600">No missed reports for the current week.</p>
          ) : (
            missed.map((item) => (
              <p key={item.user.id} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-ink-950">
                {item.user.name}
              </p>
            ))
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-ink-950">Latest Reported Challenges</h2>
        </CardHeader>
        <CardContent className="space-y-2">
          {latestChallenges.length === 0 ? (
            <p className="text-sm text-ink-600">No reported challenges in visible history.</p>
          ) : (
            latestChallenges.map((report) => (
              <div key={report.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-ink-950">{getUserName(report.userId)}</p>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-600">{report.challengesComments}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WeeklyTimelineList({
  items,
  selectedItemId,
  managerMode,
  onSelect,
}: {
  items: HistoryTimelineItem[];
  selectedItemId: string | null;
  managerMode: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-950">Update Timeline</h2>
            <p className="mt-1 text-sm text-ink-600">Weekly updates by week, with status, priorities, challenges, and comments.</p>
          </div>
          <Badge tone="neutral">{items.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <EmptyState title="No weekly updates" description="No updates match the current filters." />
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`block w-full rounded-lg border p-4 text-left transition ${
                selectedItemId === item.id ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/30"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {managerMode ? <h3 className="text-base font-semibold text-ink-950">{item.user.name}</h3> : null}
                    <Badge tone={item.submittedStatus === "Submitted" ? "success" : "danger"}>{item.submittedStatus}</Badge>
                    <Badge tone={statusTone(item.okrUpdateStatus)}>{item.okrUpdateStatus}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-ink-600">
                    {formatDate(item.weekStartDate)} - {formatDate(item.weekEndDate)}
                  </p>
                </div>
                <Badge tone="neutral">{item.comments.length} comment{item.comments.length === 1 ? "" : "s"}</Badge>
              </div>
              <div className="mt-4 grid gap-3">
                <TimelinePreview
                  title="Last week follow-up"
                  text={summarizeFollowUps(item.report)}
                />
                <TimelinePreview
                  title="Next week priorities"
                  text={item.report?.nextWeekPriorities.filter(Boolean).join(" / ") || "No priorities submitted."}
                />
                <TimelinePreview
                  title="Challenges"
                  text={item.report?.challengesComments || "No challenges reported."}
                />
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function WeeklyHistoryDetail({
  item,
  managerMode,
  objectives: mergedObjectives,
  keyResults: mergedKeyResults,
  weeklyReports: mergedWeeklyReports,
  canComment,
  onAddComment,
}: {
  item: HistoryTimelineItem | null;
  managerMode: boolean;
  objectives: typeof objectives;
  keyResults: typeof keyResults;
  weeklyReports: WeeklyReport[];
  canComment: boolean;
  onAddComment: (report: WeeklyReport, body: string, parentCommentId?: string | null) => void;
}) {
  if (!item) {
    return (
      <Card>
        <CardContent>
          <EmptyState title="Select a week" description="Choose a weekly update from the timeline to review details." />
        </CardContent>
      </Card>
    );
  }

  const report = item.report;
  const previousReport = report ? getPreviousReportFor(report, mergedWeeklyReports) : undefined;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-950">
              {managerMode ? `${item.user.name} / ` : ""}{formatDate(item.weekStartDate)} - {formatDate(item.weekEndDate)}
            </h2>
            <p className="mt-1 text-sm text-ink-600">Selected weekly update detail for execution continuity.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={item.submittedStatus === "Submitted" ? "success" : "danger"}>{item.submittedStatus}</Badge>
            <Badge tone={statusTone(item.okrUpdateStatus)}>{item.okrUpdateStatus}</Badge>
            {report ? <Badge tone={managerReviewStatusTone(report.managerReviewStatus)}>{formatManagerReviewStatus(report.managerReviewStatus)}</Badge> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {report ? (
          <ReportSection title="Manager review status">
            <div className="grid gap-3 md:grid-cols-3">
              <Signal label="Review state" value={formatManagerReviewStatus(report.managerReviewStatus)} />
              <Signal label="Reviewed by" value={report.reviewedByUserId ? getUserName(report.reviewedByUserId) : "Not reviewed"} />
              <Signal label="Reviewed at" value={report.reviewedAt ? formatDateTime(report.reviewedAt) : "Not reviewed"} />
            </div>
            {report.managerReviewNote ? <p className="mt-3 text-sm leading-6 text-ink-600">{report.managerReviewNote}</p> : null}
          </ReportSection>
        ) : null}

        <ReportSection title="Last week priorities and completion">
          {!report || report.lastWeekPriorityFollowUps.length === 0 ? (
            <p className="text-sm text-ink-600">No follow-up items recorded.</p>
          ) : (
            <div className="space-y-3">
              {report.lastWeekPriorityFollowUps.map((followUp) => (
                <FollowUpResultCard key={followUp.id} followUp={followUp} priority={findPreviousPriorityForFollowUp(followUp.previousPriorityText, previousReport)} />
              ))}
            </div>
          )}
        </ReportSection>

        <ReportSection title="Objective / KR check-in summary">
          {item.checkIns.length === 0 ? (
            <p className="text-sm text-ink-600">No Objective or KR check-ins recorded for this week.</p>
          ) : (
            <div className="space-y-3">
              {item.checkIns.map((checkIn) => {
                const objective = mergedObjectives.find((entry) => entry.id === checkIn.objectiveId);
                const keyResult = checkIn.keyResultId ? mergedKeyResults.find((entry) => entry.id === checkIn.keyResultId) : undefined;

                return (
                  <div key={checkIn.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={checkIn.resourceType === "key_result" ? "neutral" : "info"}>
                        {checkIn.resourceType === "key_result" ? "Key Result" : "Objective"}
                      </Badge>
                      <p className="text-sm font-semibold text-ink-950">{keyResult?.title ?? objective?.title ?? "Check-in"}</p>
                    </div>
                    {keyResult ? <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-600">Objective: {objective?.title ?? "Unknown objective"}</p> : null}
                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      <Signal label="Progress" value={formatCheckInProgress(checkIn)} />
                      <Signal label="Status" value={checkIn.keyResultStatus ?? checkIn.objectiveStatus ?? "No status"} />
                      <Signal label="Note" value={checkIn.notes ?? "No note"} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ReportSection>

        <ReportSection title="Next week priorities">
          {report?.nextWeekPriorities.filter(Boolean).length ? (
            <ol className="space-y-2">
              {report.nextWeekPriorities.filter(Boolean).map((priority, index) => (
                <li key={`${report.id}-priority-${index}`} className="rounded-md bg-slate-50 p-3 text-sm font-semibold text-ink-950">
                  {index + 1}. {priority}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-ink-600">No next-week priorities submitted.</p>
          )}
        </ReportSection>

        <ReportSection title="Blockers / challenges">
          <p className="text-sm leading-6 text-ink-600">{report?.challengesComments || "No blockers or challenges reported."}</p>
        </ReportSection>

        <ReportSection title="Manager comments / discussion">
          {report ? (
            <Discussion comments={item.comments} canComment={canComment} getAuthorName={getUserName} onAddComment={(body, parentCommentId) => onAddComment(report, body, parentCommentId)} />
          ) : (
            <p className="text-sm text-ink-600">Discussion is available after a weekly update is submitted.</p>
          )}
        </ReportSection>
      </CardContent>
    </Card>
  );
}

function TimelinePreview({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">{title}</p>
      <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-700">{text}</p>
    </div>
  );
}

function FollowUpResultCard({
  followUp,
  priority,
}: {
  followUp: WeeklyReport["lastWeekPriorityFollowUps"][number];
  priority?: WeeklyPriority;
}) {
  const priorityType = priority?.priorityType ?? "ad_hoc";
  const trackerLinks = priority?.trackerLinks ?? [];

  return (
    <div className="rounded-md bg-slate-50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={priority?.isTopPriority === false ? "neutral" : "info"}>{priority?.isTopPriority === false ? "Additional" : "Top 3"}</Badge>
            {priorityType === "linked_key_result" ? <Badge tone="info">Linked KR</Badge> : <Badge tone="neutral">Ad hoc / operational</Badge>}
          </div>
          <p className="mt-2 text-sm font-semibold text-ink-950">{followUp.previousPriorityText}</p>
          {priorityType === "linked_key_result" ? (
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-600">Linked priority from previous report</p>
          ) : null}
        </div>
        <Badge tone="neutral">{followUp.status}</Badge>
      </div>
      {trackerLinks.length > 0 ? <TrackerLinksPreview trackerLinks={trackerLinks} /> : null}
      {followUp.note ? <p className="mt-2 text-sm leading-6 text-ink-600">{followUp.note}</p> : null}
    </div>
  );
}

function TrackerLinksPreview({ trackerLinks }: { trackerLinks: TrackerLink[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {trackerLinks.map((trackerLink) => (
        <a
          key={trackerLink.id}
          href={trackerLink.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-dten-blue hover:bg-blue-50"
        >
          {trackerLink.title}
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">{label}</p>
      <p className="mt-1 line-clamp-2 text-sm font-semibold text-ink-950">{value}</p>
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 p-4">
      <h4 className="text-sm font-semibold text-ink-950">{title}</h4>
      <div className="mt-3">{children}</div>
    </div>
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
  children: React.ReactNode;
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

function getScopedUsers(activeUser: User) {
  if (activeUser.role === "Admin") {
    return users;
  }

  if (activeUser.role === "Manager") {
    return users.filter((user) => user.primaryManagerId === activeUser.id || user.localManagerId === activeUser.id);
  }

  return [activeUser];
}

function getHeaderDescription(activeUser: User) {
  if (activeUser.role === "Admin") {
    return "Direct report weekly update history";
  }

  if (activeUser.role === "Manager") {
    return "Direct report weekly update history";
  }

  return "Your weekly update history";
}

function getUserName(userId: string) {
  return users.find((user) => user.id === userId)?.name ?? "Unknown user";
}

function summarizeFollowUps(report?: WeeklyReport) {
  if (!report || report.lastWeekPriorityFollowUps.length === 0) {
    return "No follow-up items recorded.";
  }

  const counts = report.lastWeekPriorityFollowUps.reduce<Record<string, number>>((summary, followUp) => {
    summary[followUp.status] = (summary[followUp.status] ?? 0) + 1;
    return summary;
  }, {});

  return Object.entries(counts)
    .map(([status, count]) => `${count} ${status.toLowerCase()}`)
    .join(" / ");
}

function getPreviousReportFor(report: WeeklyReport, allReports: WeeklyReport[]) {
  return allReports
    .filter((candidate) => candidate.userId === report.userId && candidate.weekStartDate < report.weekStartDate)
    .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))[0];
}

function findPreviousPriorityForFollowUp(previousPriorityText: string, previousReport?: WeeklyReport) {
  return previousReport?.weeklyPriorities?.find((priority) => priority.text.trim() === previousPriorityText.trim());
}

function formatCheckInProgress(checkIn: CheckIn) {
  const currentValue = checkIn.currentValue ?? null;
  const progressPercent = checkIn.progressPercent ?? null;

  if (currentValue !== null && progressPercent !== null) {
    return `${currentValue} / ${progressPercent}%`;
  }

  if (currentValue !== null) {
    return String(currentValue);
  }

  if (progressPercent !== null) {
    return `${progressPercent}%`;
  }

  return "No progress value";
}

function statusTone(status: OkrUpdateStatus) {
  if (status === "Updated") return "success";
  if (status === "Partially Updated") return "warning";
  if (status === "Not Updated") return "danger";
  return "neutral";
}

function formatManagerReviewStatus(status: ManagerReviewStatus) {
  if (status === "not_reviewed") return "Submitted, not reviewed";
  if (status === "needs_follow_up") return "Needs Follow-up";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function managerReviewStatusTone(status: ManagerReviewStatus) {
  if (status === "reviewed") return "success";
  if (status === "commented") return "info";
  if (status === "needs_follow_up") return "warning";
  return "neutral";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
