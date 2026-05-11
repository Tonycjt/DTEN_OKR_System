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
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  addLocalAuditLog,
  addLocalComment,
  addLocalNotification,
  createEmptyLocalOkrStore,
  loadLocalOkrStore,
  saveLocalOkrStore,
  upsertLocalWeeklyReport,
  upsertLocalApproval,
  upsertLocalObjective,
} from "@/lib/local-okr-store";
import { mergeById } from "@/lib/merge-by-id";
import { mockCurrentDate } from "@/lib/mock-current-date";
import { approvals, checkIns, comments, keyResults, objectives, okrChangeRequests, quarters, teams, users, weeklyReports } from "@/mock-data";
import { useMockSessionUser } from "@/lib/mock-session";
import { deriveKRPacingStatus } from "@/lib/kr-monthly-checkpoints";
import { applyRollupAutomation } from "@/lib/okr-rollups";
import { canApproveObjective, canCommentOnResource, canViewWeeklyReport } from "@/lib/permission-helpers";
import { getAdHocPriorities, getAdditionalPriorities, getPriorityTrackerLinks, getPrioritiesLinkedToKeyResults, getTopPriorities } from "@/lib/weekly-priority-helpers";
import {
  deriveOkrUpdateStatus,
  getActiveObjectivesForUser,
  getCheckInsForUserWeek,
  getCurrentWeek,
  getWeeklyReportForWeek,
} from "@/lib/weekly-execution";
import { deriveWeeklyReminderStatus, weeklyReminderStatusTone, type WeeklyReminderStatus } from "@/lib/weekly-reminder-status";
import type { Approval, AuditLog, Comment, Confidence, KeyResult, ManagerReviewStatus, Notification, Objective, ObjectiveStatus, OkrChangeRequest, OkrUpdateStatus, ResourceType, TrackerLink, User, WeeklyPriority, WeeklyReport } from "@/types";

const allValue = "All";
const objectiveStatuses: ObjectiveStatus[] = ["Draft", "Active", "At Risk", "Off Track", "Completed", "On Hold", "Archived"];
const confidenceOptions: Confidence[] = ["High", "Medium", "Low"];
const updateStatuses: OkrUpdateStatus[] = ["No Active OKRs", "Not Updated", "Partially Updated", "Updated"];

type PendingApprovalItem = {
  approval: Approval;
  objective: Objective;
  owner: User;
};

type ReportPreview = {
  user: User;
  report?: WeeklyReport;
  updateStatus: OkrUpdateStatus;
  activeObjectiveCount: number;
  submittedLabel: string;
  nextPriorities: string[];
  topPriorities: WeeklyPriority[];
  linkedPriorityCount: number;
  adHocPriorityCount: number;
  priorityTrackerLinkCount: number;
  challengesPreview: string | null;
  atRiskCount: number;
  behindTargetCount: number;
  topBehindTarget?: {
    keyResult: KeyResult;
    objective: Objective;
  };
  commentCount: number;
  keyResultCheckInCount: number;
  reminderStatus: WeeklyReminderStatus;
};

export function ManagerReviewView() {
  const activeUser = useMockSessionUser();
  const [store, setStore] = useState(() => createEmptyLocalOkrStore());
  const [teamId, setTeamId] = useState(allValue);
  const [weekStartDate, setWeekStartDate] = useState(getDefaultManagerWeekStart);
  const [quarterId, setQuarterId] = useState(quarters.find((quarter) => quarter.isActive)?.id ?? quarters[0].id);
  const [status, setStatus] = useState<ObjectiveStatus | typeof allValue>(allValue);
  const [confidence, setConfidence] = useState<Confidence | typeof allValue>(allValue);
  const [updateStatus, setUpdateStatus] = useState<OkrUpdateStatus | typeof allValue>(allValue);
  const [hasBlockers, setHasBlockers] = useState(allValue);
  const [missingUpdate, setMissingUpdate] = useState(allValue);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const refreshStore = () => setStore(loadLocalOkrStore());
    refreshStore();
    window.addEventListener("dten-local-okrs-updated", refreshStore);

    return () => window.removeEventListener("dten-local-okrs-updated", refreshStore);
  }, []);

  const mergedObjectives = useMemo(() => mergeById(objectives, store.objectives), [store.objectives]);
  const mergedKeyResults = useMemo(() => mergeById(keyResults, store.keyResults), [store.keyResults]);
  const mergedApprovals = useMemo(() => mergeById(approvals, store.approvals), [store.approvals]);
  const mergedWeeklyReports = useMemo(() => mergeById(weeklyReports, store.weeklyReports), [store.weeklyReports]);
  const mergedCheckIns = useMemo(() => mergeById(checkIns, store.checkIns), [store.checkIns]);
  const mergedComments = useMemo(() => mergeById(comments, store.comments), [store.comments]);
  const mergedChangeRequests = useMemo(() => mergeById(okrChangeRequests, store.okrChangeRequests), [store.okrChangeRequests]);

  const selectedWeek = useMemo(() => getWeekFromStart(weekStartDate), [weekStartDate]);
  const directReports = useMemo(() => {
    if (activeUser.role !== "Manager") return [];
    return users.filter((user) => user.primaryManagerId === activeUser.id || user.localManagerId === activeUser.id);
  }, [activeUser]);
  const filteredDirectReports = useMemo(
    () => directReports.filter((user) => teamId === allValue || user.teamId === teamId),
    [directReports, teamId],
  );
  const filteredDirectReportIds = useMemo(() => new Set(filteredDirectReports.map((user) => user.id)), [filteredDirectReports]);
  const teamOptions = useMemo(() => {
    const directReportTeamIds = new Set(directReports.map((user) => user.teamId));
    return teams.filter((team) => directReportTeamIds.has(team.id));
  }, [directReports]);

  useEffect(() => {
    if (teamId === allValue || teamOptions.some((team) => team.id === teamId)) {
      return;
    }

    setTeamId(allValue);
  }, [teamId, teamOptions]);

  const weekOptions = useMemo(() => {
    const reportWeeks = mergedWeeklyReports.map((report) => report.weekStartDate);
    return Array.from(new Set([getCurrentWeek().week_start_date, ...reportWeeks])).sort((a, b) => b.localeCompare(a));
  }, [mergedWeeklyReports]);

  const reportPreviews = useMemo<ReportPreview[]>(() => {
    return filteredDirectReports.map((user) => {
      const activeObjectives = getActiveObjectivesForUser(user.id, { objectives: mergedObjectives, quarterId, week: selectedWeek });
      const userCheckIns = getCheckInsForUserWeek(user.id, { checkIns: mergedCheckIns, objectives: mergedObjectives, week: selectedWeek });
      const report = getWeeklyReportForWeek(user.id, { weeklyReports: mergedWeeklyReports, week: selectedWeek });
      const reportComments = report ? mergedComments.filter((comment) => comment.resourceType === "weekly_report" && comment.resourceId === report.id) : [];
      const topPriorities = report ? getTopPriorities(report) : [];
      const linkedPriorities = report ? getPrioritiesLinkedToKeyResults(report) : [];
      const adHocPriorities = report ? getAdHocPriorities(report) : [];
      const priorityTrackerLinkCount = report?.weeklyPriorities.reduce((count, priority) => count + getPriorityTrackerLinks(priority).length, 0) ?? 0;
      const atRiskCount = activeObjectives.filter((objective) => objective.status === "At Risk" || objective.status === "Off Track").length;
      const behindTargetKrs = getBehindTargetKrs(activeObjectives, mergedKeyResults);
      const updateStatus = report?.okrUpdateStatus ?? deriveOkrUpdateStatus(activeObjectives, userCheckIns);
      return {
        user,
        report,
        updateStatus,
        activeObjectiveCount: activeObjectives.length,
        submittedLabel: report?.submittedAt ? formatDateTime(report.submittedAt) : "Missing",
        nextPriorities: report?.nextWeekPriorities.filter((priority): priority is string => Boolean(priority)) ?? [],
        topPriorities,
        linkedPriorityCount: linkedPriorities.length,
        adHocPriorityCount: adHocPriorities.length,
        priorityTrackerLinkCount,
        challengesPreview: report?.challengesComments ?? null,
        atRiskCount,
        behindTargetCount: behindTargetKrs.length,
        topBehindTarget: behindTargetKrs[0],
        commentCount: reportComments.length,
        keyResultCheckInCount: userCheckIns.filter((checkIn) => checkIn.resourceType === "key_result").length,
        reminderStatus: deriveWeeklyReminderStatus({
          report,
          okrUpdateStatus: updateStatus,
          hasSavedDraft: false,
          weekEndDate: selectedWeek.week_end_date,
        }),
      };
    });
  }, [filteredDirectReports, mergedCheckIns, mergedComments, mergedKeyResults, mergedObjectives, mergedWeeklyReports, quarterId, selectedWeek]);

  const visibleReportPreviews = reportPreviews.filter((item) => {
    const matchesUpdateStatus = updateStatus === allValue || item.updateStatus === updateStatus;
    const matchesBlockers = hasBlockers === allValue || (hasBlockers === "Yes" ? Boolean(item.challengesPreview) : !item.challengesPreview);
    const matchesMissing = missingUpdate === allValue || (missingUpdate === "Yes" ? !item.report?.submittedAt : Boolean(item.report?.submittedAt));

    return matchesUpdateStatus && matchesBlockers && matchesMissing;
  });
  const missingReports = visibleReportPreviews.filter((item) => !item.report?.submittedAt);
  const partialReports = visibleReportPreviews.filter((item) => item.updateStatus === "Partially Updated");
  const completedCount = visibleReportPreviews.filter((item) => item.report?.submittedAt).length;
  const completionPercentage = visibleReportPreviews.length ? Math.round((completedCount / visibleReportPreviews.length) * 100) : 0;
  const behindTargetKrCount = visibleReportPreviews.reduce((sum, item) => sum + item.behindTargetCount, 0);
  const directReportsWithBehindTargetKrs = visibleReportPreviews.filter((item) => item.behindTargetCount > 0).length;
  const weeklyUpdatesNeedingReview = visibleReportPreviews.filter((item) => item.report?.submittedAt && item.report.managerReviewStatus === "not_reviewed");
  const weeklyUpdatesNeedingFollowUp = visibleReportPreviews.filter((item) => item.report?.managerReviewStatus === "needs_follow_up");
  const adHocHeavyReports = visibleReportPreviews.filter((item) => item.adHocPriorityCount > item.linkedPriorityCount && item.adHocPriorityCount >= 2);

  const directReportObjectives = useMemo(() => {
    return mergedObjectives.filter((objective) => {
      return (
        filteredDirectReportIds.has(objective.ownerUserId) &&
        objective.quarterId === quarterId &&
        (status === allValue || objective.status === status) &&
        (confidence === allValue || objective.confidence === confidence)
      );
    });
  }, [confidence, filteredDirectReportIds, mergedObjectives, quarterId, status]);

  const atRiskObjectives = directReportObjectives.filter((objective) => objective.status === "At Risk" || objective.status === "Off Track");
  const pendingChangeRequests = useMemo(() => {
    return mergedChangeRequests
      .filter((changeRequest) => changeRequest.status === "pending")
      .filter((changeRequest) => {
        const objective = mergedObjectives.find((item) => item.id === changeRequest.objectiveId);
        return Boolean(objective && filteredDirectReportIds.has(objective.ownerUserId) && changeRequest.approverUserId === activeUser.id);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [activeUser.id, filteredDirectReportIds, mergedChangeRequests, mergedObjectives]);
  const submittedReports = visibleReportPreviews.filter((item) => item.report?.submittedAt);
  const pendingApprovals = useMemo(() => {
    const permissionContext = { users, objectives: mergedObjectives, keyResults: mergedKeyResults };
    return mergedApprovals
      .filter((approval) => approval.approvalStatus === "Pending")
      .map((approval) => {
        const objective = mergedObjectives.find((item) => item.id === approval.objectiveId);
        const owner = objective ? users.find((user) => user.id === objective.ownerUserId) : undefined;
        return objective && owner ? { approval, objective, owner } : null;
      })
      .filter((item): item is PendingApprovalItem => {
        return Boolean(item && filteredDirectReportIds.has(item.owner.id) && canApproveObjective(activeUser, item.objective, permissionContext));
      });
  }, [activeUser, filteredDirectReportIds, mergedApprovals, mergedKeyResults, mergedObjectives]);

  const rejectedOrResubmittedOkrs = directReportObjectives.filter((objective) => {
    return objective.approvalState === "Rejected" || objective.approvalState === "Changes Pending Re-approval";
  });
  const reportedChallenges = visibleReportPreviews
    .filter((item) => item.report?.challengesComments && canViewReport(activeUser, item.report))
    .map((item) => item.report!)
    .slice(0, 6);
  const selectedPreview = visibleReportPreviews.find((item) => item.user.id === selectedUserId) ?? null;

  function canViewReport(user: User, report?: WeeklyReport) {
    if (!report) return false;
    return canViewWeeklyReport(user, report, {
      users,
      objectives: mergedObjectives,
      weeklyReportPolicy: { includeLocalManager: true },
    });
  }

  function decideApproval(item: PendingApprovalItem, decision: "Approved" | "Rejected") {
    setMessage(null);
    const note = rejectNotes[item.approval.id]?.trim() ?? "";
    if (decision === "Rejected" && !note) {
      setMessage("Reject requires a note.");
      return;
    }

    const timestamp = new Date().toISOString();
    const nextObjective: Objective = {
      ...item.objective,
      approvalState: decision,
      status: decision === "Approved" ? "Active" : "Draft",
      isActive: decision === "Approved",
      activeFrom: decision === "Approved" ? timestamp.slice(0, 10) : item.objective.activeFrom,
      updatedByUserId: activeUser.id,
      updatedAt: timestamp,
    };
    const nextApproval: Approval = {
      ...item.approval,
      approvalStatus: decision,
      approvalNote: decision === "Rejected" ? note : "Approved for quarterly execution.",
      approvalTimestamp: timestamp,
    };
    const notification: Notification = {
      id: `local-notification-${crypto.randomUUID()}`,
      userId: item.objective.ownerUserId,
      type: decision === "Approved" ? "approval_approved" : "approval_rejected",
      resourceType: "objective",
      resourceId: item.objective.id,
      channel: "in_app",
      sentAt: timestamp,
      readAt: null,
      status: "Sent",
    };
    const auditLog: AuditLog = {
      id: `local-audit-${crypto.randomUUID()}`,
      actorUserId: activeUser.id,
      actionType: decision === "Approved" ? "objective_approved" : "objective_rejected",
      targetType: "objective",
      targetId: item.objective.id,
      metadata: { approvalId: item.approval.id, prototype: true },
      createdAt: timestamp,
    };

    let nextStore = upsertLocalObjective(loadLocalOkrStore(), nextObjective);
    nextStore = upsertLocalApproval(nextStore, nextApproval);
    nextStore = addLocalNotification(nextStore, notification);
    nextStore = addLocalAuditLog(nextStore, auditLog);
    nextStore = applyRollupAutomation(nextStore);
    saveLocalOkrStore(nextStore);
    setStore(nextStore);
    setRejectNotes((drafts) => ({ ...drafts, [item.approval.id]: "" }));
    setMessage(decision === "Approved" ? "OKR approved and activated." : "OKR rejected and returned to the owner.");
  }

  function addComment(resourceType: ResourceType, resourceId: string, resource: Objective | WeeklyReport, bodyOverride?: string | null, parentCommentId?: string | null) {
    const key = `${resourceType}:${resourceId}`;
    const body = (bodyOverride ?? commentDrafts[key] ?? "").trim();
    if (!body) {
      setMessage("Add a comment before saving.");
      return;
    }

    const permissionContext = {
      users,
      objectives: mergedObjectives,
      keyResults: mergedKeyResults,
      weeklyReportPolicy: { includeLocalManager: true },
    };
    if (!canCommentOnResource(activeUser, resource, permissionContext)) {
      setMessage("The selected mock user cannot comment on this record.");
      return;
    }

    const parentComment = parentCommentId ? mergedComments.find((comment) => comment.id === parentCommentId) : undefined;
    if (parentCommentId && (!parentComment || parentComment.resourceType !== resourceType || parentComment.resourceId !== resourceId)) {
      setMessage("Reply must stay in the same discussion thread.");
      return;
    }

    const timestamp = new Date().toISOString();
    const comment: Comment = {
      id: `local-comment-${crypto.randomUUID()}`,
      resourceType,
      resourceId,
      parentCommentId: parentCommentId ?? null,
      authorUserId: activeUser.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      body,
      archived: false,
    };

    const targetUserId = parentComment?.authorUserId ?? (resourceType === "weekly_report" ? (resource as WeeklyReport).userId : (resource as Objective).ownerUserId);
    let nextStore = addLocalComment(loadLocalOkrStore(), comment);
    if (resourceType === "weekly_report") {
      const weeklyReport = resource as WeeklyReport;
      nextStore = upsertLocalWeeklyReport(nextStore, applyManagerReviewState(weeklyReport, activeUser.id, "commented"));
    }
    if (targetUserId !== activeUser.id) {
      const notification: Notification = {
        id: `local-notification-${crypto.randomUUID()}`,
        userId: targetUserId,
        type: parentCommentId ? "comment_replied" : "comment_created",
        resourceType,
        resourceId,
        channel: "in_app",
        sentAt: timestamp,
        readAt: null,
        status: "Sent",
      };
      nextStore = addLocalNotification(nextStore, notification);
    }

    saveLocalOkrStore(nextStore);
    setStore(nextStore);
    setCommentDrafts((drafts) => ({ ...drafts, [key]: "" }));
    setMessage(parentCommentId ? "Reply added." : "Comment added. Weekly update marked commented.");
  }

  function updateReportReviewState(report: WeeklyReport | undefined, managerReviewStatus: ManagerReviewStatus) {
    if (!report) {
      setMessage("Select a submitted weekly update before updating manager review state.");
      return;
    }

    const nextStore = upsertLocalWeeklyReport(loadLocalOkrStore(), applyManagerReviewState(report, activeUser.id, managerReviewStatus));
    saveLocalOkrStore(nextStore);
    setStore(nextStore);
    setMessage(
      managerReviewStatus === "reviewed"
        ? "Weekly update marked reviewed."
        : managerReviewStatus === "needs_follow_up"
          ? "Weekly update marked needs follow-up."
          : "Weekly update review state updated.",
    );
  }

  if (activeUser.role !== "Manager") {
    return (
      <div className="space-y-6">
        <PageHeader title="Manager Review" description="Weekly execution review is available to Manager users." />
        <Card>
          <CardContent>
            <EmptyState
              title="Manager access required"
              description={`${activeUser.name} is a ${activeUser.role}. Select a Manager user in the top bar to review direct-report execution signals.`}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manager Review"
        description="Weekly operating rhythm for direct-report updates, blockers, OKR risk, and manager follow-up."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/approvals">
              <Button variant="secondary">Open Approvals</Button>
            </Link>
            <Link href="/weekly-history">
              <Button variant="secondary">Weekly History</Button>
            </Link>
          </div>
        }
      />

      {message ? <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-dten-blue">{message}</div> : null}

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-ink-950">Review Filters</h2>
          <p className="mt-1 text-sm text-ink-600">Filter direct-report execution signals without creating tasks or assignments.</p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SelectField label="Week" value={weekStartDate} onChange={setWeekStartDate}>
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
            {updateStatuses.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </SelectField>
          <SelectField label="OKR status" value={status} onChange={(value) => setStatus(value as ObjectiveStatus | typeof allValue)}>
            <option>{allValue}</option>
            {objectiveStatuses.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </SelectField>
          <SelectField label="Confidence" value={confidence} onChange={(value) => setConfidence(value as Confidence | typeof allValue)}>
            <option>{allValue}</option>
            {confidenceOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </SelectField>
          <SelectField label="Has blockers" value={hasBlockers} onChange={setHasBlockers}>
            <option>{allValue}</option>
            {["Yes", "No"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </SelectField>
          <SelectField label="Missing update" value={missingUpdate} onChange={setMissingUpdate}>
            <option>{allValue}</option>
            {["Yes", "No"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </SelectField>
          <SelectField label="Quarter" value={quarterId} onChange={setQuarterId}>
            {quarters.map((quarter) => (
              <option key={quarter.id} value={quarter.id}>
                {quarter.label}
              </option>
            ))}
          </SelectField>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="KRs behind monthly target" value={String(behindTargetKrCount)} tone={behindTargetKrCount > 0 ? "warning" : "success"} />
        <StatCard label="Direct reports with behind-target KRs" value={String(directReportsWithBehindTargetKrs)} tone={directReportsWithBehindTargetKrs > 0 ? "warning" : "success"} />
        <StatCard label="Submitted awaiting manager review" value={String(weeklyUpdatesNeedingReview.length)} tone={weeklyUpdatesNeedingReview.length > 0 ? "warning" : "success"} />
        <StatCard label="Needs manager follow-up" value={String(weeklyUpdatesNeedingFollowUp.length)} tone={weeklyUpdatesNeedingFollowUp.length > 0 ? "warning" : "success"} />
        <StatCard label="Ad hoc-heavy priorities" value={String(adHocHeavyReports.length)} tone={adHocHeavyReports.length > 0 ? "warning" : "success"} />
        <StatCard label="Pending OKR change requests" value={String(pendingChangeRequests.length)} tone={pendingChangeRequests.length > 0 ? "warning" : "success"} />
        <StatCard label="At risk / off track OKRs" value={String(atRiskObjectives.length)} tone={atRiskObjectives.length > 0 ? "warning" : "success"} />
        <StatCard label="Weekly update completion" value={`${completionPercentage}%`} tone="success" />
        <StatCard label="Submitted updates" value={String(submittedReports.length)} tone="success" />
        <StatCard label="Missing updates" value={String(missingReports.length)} tone="danger" />
        <StatCard label="Partially updated OKRs" value={String(partialReports.length)} tone="warning" />
        <StatCard label="Reported challenges" value={String(reportedChallenges.length)} tone="warning" />
      </div>

      <DirectReportStatusGroups previews={visibleReportPreviews} onSelect={(preview) => setSelectedUserId(preview.user.id)} />

      <DirectReportUpdateList
        previews={visibleReportPreviews}
        onSelect={(preview) => setSelectedUserId(preview.user.id)}
      />

      <details className="rounded-lg border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink-950">More manager signals</summary>
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <PeopleListCard
              title="Direct Reports Missing Weekly Updates"
              badgeTone="danger"
              emptyTitle="No missing reports"
              people={missingReports.map((item) => item.user)}
            />
            <PeopleListCard
              title="Direct Reports With Partially Updated OKRs"
              badgeTone="warning"
              emptyTitle="No partial updates"
              people={partialReports.map((item) => item.user)}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <PendingApprovalsCard items={pendingApprovals} rejectNotes={rejectNotes} setRejectNotes={setRejectNotes} onDecision={decideApproval} />
            <PendingChangeRequestsCard changeRequests={pendingChangeRequests} objectives={mergedObjectives} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <AdHocHeavyCard previews={adHocHeavyReports} onSelect={(preview) => setSelectedUserId(preview.user.id)} />
            <RejectedResubmittedCard objectives={rejectedOrResubmittedOkrs} approvals={mergedApprovals} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ObjectiveRiskCard objectives={atRiskObjectives} comments={mergedComments} commentDrafts={commentDrafts} setCommentDrafts={setCommentDrafts} addComment={addComment} />
            <ChallengesCard reports={reportedChallenges} comments={mergedComments} commentDrafts={commentDrafts} setCommentDrafts={setCommentDrafts} addComment={addComment} />
          </div>
        </div>
      </details>

      <WeeklyUpdateDetailDrawer
        preview={selectedPreview}
        selectedWeek={selectedWeek}
        objectives={mergedObjectives}
        keyResults={mergedKeyResults}
        checkIns={mergedCheckIns}
        comments={mergedComments}
        weeklyReports={mergedWeeklyReports}
        addComment={addComment}
        onMarkReviewed={() => updateReportReviewState(selectedPreview?.report, "reviewed")}
        onMarkNeedsFollowUp={() => updateReportReviewState(selectedPreview?.report, "needs_follow_up")}
        onClose={() => setSelectedUserId(null)}
      />
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "danger" | "neutral" }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink-600">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-ink-950">{value}</p>
          </div>
          <Badge tone={tone}>Review</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function DirectReportUpdateList({
  previews,
  onSelect,
}: {
  previews: ReportPreview[];
  onSelect: (preview: ReportPreview) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-950">Direct Report Updates</h2>
            <p className="mt-1 text-sm text-ink-600">Scan submitted, missing, blocked, and at-risk weekly updates without assigning work.</p>
          </div>
          <Badge tone="neutral">{previews.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {previews.length === 0 ? (
          <EmptyState title="No direct report updates" description="No direct reports match the current weekly review filters." />
        ) : (
          previews.map((preview) => (
            <div
              key={preview.user.id}
              className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-blue-200 hover:bg-blue-50/30"
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-ink-950">{preview.user.name}</h3>
                    <Badge tone={weeklyReminderStatusTone(preview.reminderStatus)}>{preview.reminderStatus}</Badge>
                    <Badge tone={preview.report?.submittedAt ? "success" : "danger"}>{preview.report?.submittedAt ? "Submitted" : "Missing"}</Badge>
                    {preview.report ? <ManagerReviewStatusBadge status={preview.report.managerReviewStatus} /> : null}
                    {preview.challengesPreview ? <Badge tone="warning">Blocker / challenge</Badge> : null}
                    {preview.atRiskCount > 0 ? <Badge tone="warning">{preview.atRiskCount} at risk</Badge> : null}
                    {preview.behindTargetCount > 0 ? <Badge tone="warning">{preview.behindTargetCount} behind monthly target</Badge> : null}
                    {preview.adHocPriorityCount > preview.linkedPriorityCount && preview.adHocPriorityCount >= 2 ? <Badge tone="warning">Ad hoc-heavy</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-ink-600">
                    {preview.user.title} / {getTeamName(preview.user.teamId)}
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-4">
                    <Signal label="Submitted" value={preview.submittedLabel} />
                    <Signal label="OKR update" value={preview.updateStatus} />
                    <Signal label="Manager review" value={preview.report ? formatManagerReviewStatus(preview.report.managerReviewStatus) : "No report"} />
                    <Signal label="KR check-ins" value={String(preview.keyResultCheckInCount)} />
                    <Signal label="Behind monthly target" value={String(preview.behindTargetCount)} />
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <Signal label="Priority mix" value={`${preview.linkedPriorityCount} linked KR / ${preview.adHocPriorityCount} ad hoc`} />
                    <Signal label="Tracker links" value={String(preview.priorityTrackerLinkCount)} />
                    <Signal label="Comments" value={String(preview.commentCount)} />
                  </div>
                  {preview.topBehindTarget ? (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Top behind-target KR</p>
                      <p className="mt-1 text-sm font-semibold leading-6 text-ink-950">{preview.topBehindTarget.keyResult.title}</p>
                      <Link
                        href={`/okrs/${preview.topBehindTarget.objective.id}`}
                        className="mt-2 inline-flex text-sm font-semibold text-dten-blue hover:underline"
                      >
                        Open OKR detail
                      </Link>
                    </div>
                  ) : null}
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <PreviewBlock
                      title="Next week priorities"
                      empty="No priorities submitted."
                      lines={(preview.topPriorities.length > 0 ? preview.topPriorities.map((priority) => priority.text) : preview.nextPriorities).slice(0, 3)}
                    />
                    <PreviewBlock
                      title="Challenges / support"
                      empty="No blockers or challenges reported."
                      lines={preview.challengesPreview ? [preview.challengesPreview] : []}
                    />
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Badge tone={updateStatusTone(preview.updateStatus)}>{preview.updateStatus}</Badge>
                  <Badge tone="neutral">{preview.commentCount} comments</Badge>
                  <Button variant="secondary" onClick={() => onSelect(preview)}>Open review</Button>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function DirectReportStatusGroups({ previews, onSelect }: { previews: ReportPreview[]; onSelect: (preview: ReportPreview) => void }) {
  const groups = [
    { title: "Awaiting manager review", empty: "No submitted updates are waiting for manager review", items: previews.filter((preview) => preview.report?.submittedAt && preview.report.managerReviewStatus === "not_reviewed") },
    { title: "Needs manager follow-up", empty: "No updates are marked for manager follow-up", items: previews.filter((preview) => preview.report?.managerReviewStatus === "needs_follow_up") },
    { title: "Behind monthly target", empty: "No direct reports with behind-target KRs", items: previews.filter((preview) => preview.behindTargetCount > 0) },
    { title: "Ad hoc-heavy", empty: "No ad hoc-heavy priority mixes", items: previews.filter((preview) => preview.adHocPriorityCount > preview.linkedPriorityCount && preview.adHocPriorityCount >= 2) },
    { title: "Missing", empty: "No missing updates", items: previews.filter((preview) => preview.reminderStatus === "Missing / overdue" || preview.reminderStatus === "Not started") },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-950">Weekly Review Signals</h2>
            <p className="mt-1 text-sm text-ink-600">Direct reports grouped by the next lightweight manager action.</p>
          </div>
          <Badge tone="neutral">{previews.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {groups.map((group) => (
          <div key={group.title} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink-950">{group.title}</h3>
              <Badge tone={managerReviewGroupTone(group.title)}>
                {group.items.length}
              </Badge>
            </div>
            <div className="mt-3 space-y-2">
              {group.items.length === 0 ? (
                <p className="text-sm text-ink-600">{group.empty}</p>
              ) : (
                group.items.slice(0, 4).map((preview) => (
                  <button
                    key={`${group.title}-${preview.user.id}`}
                    type="button"
                    onClick={() => onSelect(preview)}
                    className="block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-ink-950 hover:border-blue-200 hover:bg-blue-50/30"
                  >
                    {preview.user.name}
                  </button>
                ))
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function WeeklyUpdateDetailDrawer({
  preview,
  selectedWeek,
  objectives: mergedObjectives,
  keyResults: mergedKeyResults,
  checkIns: mergedCheckIns,
  comments: mergedComments,
  weeklyReports: mergedWeeklyReports,
  addComment,
  onMarkReviewed,
  onMarkNeedsFollowUp,
  onClose,
}: {
  preview: ReportPreview | null;
  selectedWeek: { week_start_date: string; week_end_date: string };
  objectives: Objective[];
  keyResults: typeof keyResults;
  checkIns: typeof checkIns;
  comments: Comment[];
  weeklyReports: WeeklyReport[];
  addComment: (resourceType: ResourceType, resourceId: string, resource: Objective | WeeklyReport, bodyOverride?: string | null, parentCommentId?: string | null) => void;
  onMarkReviewed: () => void;
  onMarkNeedsFollowUp: () => void;
  onClose: () => void;
}) {
  if (!preview) {
    return null;
  }

  const report = preview.report;
  const previousReport = report ? getPreviousReportFor(report, mergedWeeklyReports) : undefined;
  const userObjectives = getActiveObjectivesForUser(preview.user.id, { objectives: mergedObjectives, week: selectedWeek });
  const riskyObjectives = userObjectives.filter((objective) => objective.status === "At Risk" || objective.status === "Off Track");
  const behindTargetKrs = getBehindTargetKrs(userObjectives, mergedKeyResults);
  const userCheckIns = getCheckInsForUserWeek(preview.user.id, { checkIns: mergedCheckIns, objectives: mergedObjectives, week: selectedWeek });
  const krCheckIns = userCheckIns.filter((checkIn) => checkIn.resourceType === "key_result");
  const reportComments = report ? mergedComments.filter((comment) => comment.resourceType === "weekly_report" && comment.resourceId === report.id) : [];
  const reportPriorities = report ? [...getTopPriorities(report), ...getAdditionalPriorities(report)] : [];
  const reviewed = report?.managerReviewStatus === "reviewed";

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink-950/30">
      <aside className="h-full w-full overflow-y-auto bg-white shadow-xl sm:max-w-2xl">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-dten-blue">Weekly update review</p>
              <h2 className="mt-1 text-xl font-semibold text-ink-950">{preview.user.name}</h2>
              <p className="mt-1 text-sm text-ink-600">
                {preview.user.title} / {getTeamName(preview.user.teamId)} / {formatDate(selectedWeek.week_start_date)}
              </p>
            </div>
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={report?.submittedAt ? "success" : "danger"}>{report?.submittedAt ? "Submitted" : "Missing"}</Badge>
            <Badge tone={updateStatusTone(preview.updateStatus)}>{preview.updateStatus}</Badge>
            {report ? <ManagerReviewStatusBadge status={report.managerReviewStatus} /> : <Badge tone="neutral">Missing</Badge>}
            {report?.reviewedAt ? <Badge tone="neutral">Reviewed {formatDateTime(report.reviewedAt)}</Badge> : null}
          </div>
        </div>

        <div className="space-y-4 p-5">
          <DrawerSection title="Last week follow-up">
            {!report || report.lastWeekPriorityFollowUps.length === 0 ? (
              <p className="text-sm text-ink-600">No follow-up items recorded.</p>
            ) : (
              <div className="space-y-3">
                {report.lastWeekPriorityFollowUps.map((followUp) => (
                  <FollowUpResultCard key={followUp.id} followUp={followUp} priority={findPreviousPriorityForFollowUp(followUp.previousPriorityText, previousReport)} />
                ))}
              </div>
            )}
          </DrawerSection>

          <DrawerSection title="KR check-in summary">
            {krCheckIns.length === 0 ? (
              <p className="text-sm text-ink-600">No KR check-ins recorded for this week.</p>
            ) : (
              <div className="space-y-3">
                {krCheckIns.map((checkIn) => {
                  const keyResult = checkIn.keyResultId ? mergedKeyResults.find((item) => item.id === checkIn.keyResultId) : undefined;
                  const objective = mergedObjectives.find((item) => item.id === checkIn.objectiveId);

                  return (
                    <div key={checkIn.id} className="rounded-md border border-slate-200 p-3">
                      <p className="text-sm font-semibold text-ink-950">{keyResult?.title ?? "Key Result"}</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-600">{objective?.title ?? "Objective"}</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <Signal label="Progress" value={formatCheckInProgress(checkIn)} />
                        <Signal label="Status" value={checkIn.keyResultStatus ?? "No status"} />
                        <Signal label="Monthly pacing" value={keyResult ? deriveKRPacingStatus(keyResult, mockCurrentDate) : "No KR"} />
                      </div>
                      <p className="mt-3 text-sm leading-6 text-ink-600">{checkIn.notes ?? "No note"}</p>
                      {keyResult?.trackerLinks?.length ? (
                        <div className="mt-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">KR tracker links</p>
                          <TrackerLinksPreview trackerLinks={keyResult.trackerLinks} />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </DrawerSection>

          <DrawerSection title="Next week priorities">
            {reportPriorities.length === 0 && preview.nextPriorities.length === 0 ? (
              <p className="text-sm text-ink-600">No next-week priorities submitted.</p>
            ) : (
              <div className="space-y-2">
                {(reportPriorities.length > 0 ? reportPriorities : preview.nextPriorities.map((priority, index) => createLegacyPriority(report?.id ?? preview.user.id, priority, index))).map((priority) => (
                  <PriorityReviewCard key={priority.id} priority={priority} keyResults={mergedKeyResults} objectives={mergedObjectives} />
                ))}
              </div>
            )}
          </DrawerSection>

          <DrawerSection title="Challenges / comments">
            <p className="text-sm leading-6 text-ink-600">{report?.challengesComments || "No blockers, support needs, or comments reported."}</p>
          </DrawerSection>

          <DrawerSection title="At-risk / off-track OKRs">
            {riskyObjectives.length === 0 ? (
              <p className="text-sm text-ink-600">No active at-risk or off-track OKRs for this employee under current filters.</p>
            ) : (
              <div className="space-y-2">
                {riskyObjectives.map((objective) => (
                  <Link key={objective.id} href={`/okrs/${objective.id}`} className="block rounded-md border border-slate-200 p-3 hover:bg-blue-50/30">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink-950">{objective.title}</p>
                      <StatusBadge status={objective.status} />
                    </div>
                    <ProgressBar value={objective.score} label={`${objective.confidence} confidence`} />
                  </Link>
                ))}
              </div>
            )}
          </DrawerSection>

          <DrawerSection title="Monthly pacing signals">
            {behindTargetKrs.length === 0 ? (
              <p className="text-sm text-ink-600">No visible KRs are behind the current monthly checkpoint.</p>
            ) : (
              <div className="space-y-2">
                {behindTargetKrs.map((item) => (
                  <Link key={item.keyResult.id} href={`/okrs/${item.objective.id}`} className="block rounded-md border border-amber-200 bg-amber-50 p-3 hover:bg-amber-100/50">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink-950">{item.keyResult.title}</p>
                      <Badge tone="warning">Behind monthly target</Badge>
                    </div>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-600">{item.objective.title}</p>
                    <ProgressBar value={item.keyResult.progressPercent} label="Quarterly progress" />
                  </Link>
                ))}
              </div>
            )}
          </DrawerSection>

          <DrawerSection title="Manager comments / discussion">
            {report ? (
              <Discussion
                comments={reportComments}
                canComment={true}
                getAuthorName={getUserName}
                onAddComment={(body, parentCommentId) => addComment("weekly_report", report.id, report, body, parentCommentId)}
              />
            ) : (
              <p className="text-sm text-ink-600">Comments become available after a weekly update is submitted.</p>
            )}
          </DrawerSection>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
            <Link href="/okrs">
              <Button variant="secondary">Open employee OKRs</Button>
            </Link>
            <Link href={`/weekly-history?employeeId=${preview.user.id}${report ? `&week=${report.weekStartDate}` : ""}`}>
              <Button variant="secondary">Open weekly report history</Button>
            </Link>
            <Button variant="secondary" onClick={onMarkNeedsFollowUp} disabled={!report || report.managerReviewStatus === "needs_follow_up"}>
              Needs follow-up
            </Button>
            <Button variant="primary" onClick={onMarkReviewed} disabled={!report || reviewed}>
              {reviewed ? "Reviewed" : "Mark reviewed"}
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-ink-950">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
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
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
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

function PriorityReviewCard({ priority, keyResults: allKeyResults, objectives: allObjectives }: { priority: WeeklyPriority; keyResults: KeyResult[]; objectives: Objective[] }) {
  const linkedKeyResult = priority.linkedKeyResultId ? allKeyResults.find((keyResult) => keyResult.id === priority.linkedKeyResultId) : undefined;
  const linkedObjective = priority.linkedObjectiveId ? allObjectives.find((objective) => objective.id === priority.linkedObjectiveId) : undefined;
  const trackerLinks = getPriorityTrackerLinks(priority);

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={priority.isTopPriority ? "info" : "neutral"}>{priority.isTopPriority ? "Top 3" : "Additional"}</Badge>
        {priority.priorityType === "linked_key_result" || priority.linkedKeyResultId ? (
          <Badge tone="info">Linked KR</Badge>
        ) : (
          <Badge tone="neutral">Ad hoc / operational</Badge>
        )}
        {trackerLinks.length > 0 ? <Badge tone="neutral">{trackerLinks.length} tracker links</Badge> : null}
      </div>
      <p className="mt-2 text-sm font-semibold leading-6 text-ink-950">{priority.priorityRank}. {priority.text}</p>
      {linkedKeyResult ? (
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-600">
          Linked KR: {linkedKeyResult.title}
          {linkedObjective ? ` / ${linkedObjective.title}` : ""}
        </p>
      ) : null}
      {trackerLinks.length > 0 ? <TrackerLinksPreview trackerLinks={trackerLinks} /> : null}
    </div>
  );
}

function createLegacyPriority(reportId: string, priorityText: string, index: number): WeeklyPriority {
  return {
    id: `${reportId}-drawer-legacy-priority-${index + 1}`,
    text: priorityText,
    priorityRank: index + 1,
    isTopPriority: index < 3,
    linkedKeyResultId: null,
    linkedObjectiveId: null,
    priorityType: "ad_hoc",
    trackerLinks: [],
    followUpStatus: null,
    followUpNote: null,
  };
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

function ManagerReviewStatusBadge({ status }: { status: ManagerReviewStatus }) {
  return <Badge tone={managerReviewStatusTone(status)}>{formatManagerReviewStatus(status)}</Badge>;
}

function formatManagerReviewStatus(status: ManagerReviewStatus) {
  if (status === "not_reviewed") return "Submitted, not reviewed";
  if (status === "needs_follow_up") return "Needs follow-up";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function managerReviewStatusTone(status: ManagerReviewStatus) {
  if (status === "reviewed") return "success";
  if (status === "commented") return "info";
  if (status === "needs_follow_up") return "warning";
  return "neutral";
}

function managerReviewGroupTone(title: string) {
  if (title === "Missing") return "danger";
  if (title === "Needs manager follow-up" || title === "Behind monthly target" || title === "Ad hoc-heavy" || title === "Awaiting manager review") return "warning";
  if (title === "Reviewed") return "success";
  if (title === "Commented") return "info";
  return "neutral";
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">{label}</p>
      <p className="mt-1 line-clamp-2 text-sm font-semibold text-ink-950">{value}</p>
    </div>
  );
}

function PreviewBlock({ title, empty, lines }: { title: string; empty: string; lines: string[] }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">{title}</p>
      {lines.length === 0 ? (
        <p className="mt-2 text-sm text-ink-600">{empty}</p>
      ) : (
        <div className="mt-2 space-y-1">
          {lines.map((line, index) => (
            <p key={`${title}-${index}`} className="line-clamp-2 text-sm font-semibold text-ink-950">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function PendingApprovalsCard({
  items,
  rejectNotes,
  setRejectNotes,
  onDecision,
}: {
  items: PendingApprovalItem[];
  rejectNotes: Record<string, string>;
  setRejectNotes: (notes: Record<string, string>) => void;
  onDecision: (item: PendingApprovalItem, decision: "Approved" | "Rejected") => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-950">Pending Approvals</h2>
            <p className="mt-1 text-sm text-ink-600">Direct-report individual OKRs waiting for manager decision.</p>
          </div>
          <Badge tone="warning">{items.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <EmptyState title="No pending approvals" description="No filtered direct-report OKRs are waiting for approval." />
        ) : (
          items.map((item) => (
            <div key={item.approval.id} className="rounded-lg border border-slate-200 p-4">
              <Link href={`/okrs/${item.objective.id}`} className="font-semibold text-ink-950 hover:text-dten-blue">
                {item.objective.title}
              </Link>
              <p className="mt-2 text-sm text-ink-600">
                {item.owner.name} / {getTeamName(item.owner.teamId)}
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
                <input
                  className="h-10 rounded-md border border-slate-200 px-3 text-sm text-ink-800 outline-none focus:border-dten-blue"
                  value={rejectNotes[item.approval.id] ?? ""}
                  onChange={(event) => setRejectNotes({ ...rejectNotes, [item.approval.id]: event.target.value })}
                  placeholder="Rejection note required if rejecting."
                />
                <Button variant="primary" onClick={() => onDecision(item, "Approved")}>
                  Approve
                </Button>
                <Button variant="secondary" onClick={() => onDecision(item, "Rejected")}>
                  Reject
                </Button>
              </div>
              <div className="mt-3">
                <Link href={`/okrs/${item.objective.id}`}>
                  <Button variant="ghost">Open OKR detail</Button>
                </Link>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function PendingChangeRequestsCard({ changeRequests, objectives: allObjectives }: { changeRequests: OkrChangeRequest[]; objectives: Objective[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-950">Pending OKR Change Requests</h2>
            <p className="mt-1 text-sm text-ink-600">Material changes to approved OKRs waiting for manager review.</p>
          </div>
          <Badge tone="warning">{changeRequests.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {changeRequests.length === 0 ? (
          <EmptyState title="No pending change requests" description="No approved OKR material changes are waiting for review." />
        ) : (
          changeRequests.map((changeRequest) => {
            const objective = allObjectives.find((item) => item.id === changeRequest.objectiveId);

            return (
              <div key={changeRequest.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {objective ? (
                      <Link href={`/okrs/${objective.id}`} className="font-semibold text-ink-950 hover:text-dten-blue">
                        {objective.title}
                      </Link>
                    ) : (
                      <p className="font-semibold text-ink-950">Unknown objective</p>
                    )}
                    <p className="mt-2 text-sm leading-6 text-ink-600">{changeRequest.reason}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(changeRequest.requestedChanges.materialChangeTypes ?? []).map((changeType) => (
                        <Badge key={changeType} tone="neutral">
                          {formatChangeType(changeType)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Badge tone="warning">Pending</Badge>
                </div>
                <div className="mt-3">
                  <Link href="/approvals">
                    <Button variant="secondary">Review in Approvals</Button>
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function AdHocHeavyCard({ previews, onSelect }: { previews: ReportPreview[]; onSelect: (preview: ReportPreview) => void }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-950">Ad hoc-heavy Priorities</h2>
            <p className="mt-1 text-sm text-ink-600">Weekly priorities with more operational items than linked KR focus.</p>
          </div>
          <Badge tone="warning">{previews.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {previews.length === 0 ? (
          <EmptyState title="No ad hoc-heavy reports" description="Priority mix is balanced or KR-linked for the current filters." />
        ) : (
          previews.map((preview) => (
            <button
              key={preview.user.id}
              type="button"
              onClick={() => onSelect(preview)}
              className="block w-full rounded-lg border border-slate-200 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/30"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink-950">{preview.user.name}</p>
                  <p className="mt-1 text-sm text-ink-600">{preview.linkedPriorityCount} linked KR / {preview.adHocPriorityCount} ad hoc</p>
                </div>
                <Badge tone="warning">Review focus</Badge>
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function PeopleListCard({
  title,
  emptyTitle,
  people,
  badgeTone,
}: {
  title: string;
  emptyTitle: string;
  people: User[];
  badgeTone: "warning" | "danger";
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink-950">{title}</h2>
          <Badge tone={badgeTone}>{people.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {people.length === 0 ? (
          <EmptyState title={emptyTitle} description="No direct reports match this signal under current filters." />
        ) : (
          people.map((user) => (
            <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4">
              <div>
                <p className="font-semibold text-ink-950">{user.name}</p>
                <p className="mt-1 text-sm text-ink-600">{getTeamName(user.teamId)}</p>
              </div>
              <Link href={`/weekly-history?employeeId=${user.id}`}>
                <Button variant="secondary">Open direct report detail</Button>
              </Link>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ObjectiveRiskCard({
  objectives: riskyObjectives,
  comments: allComments,
  commentDrafts,
  setCommentDrafts,
  addComment,
}: {
  objectives: Objective[];
  comments: Comment[];
  commentDrafts: Record<string, string>;
  setCommentDrafts: (drafts: Record<string, string>) => void;
  addComment: (resourceType: ResourceType, resourceId: string, resource: Objective | WeeklyReport) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-950">At-risk / Off-track OKRs</h2>
            <p className="mt-1 text-sm text-ink-600">Risks to review in the weekly execution rhythm.</p>
          </div>
          <Badge tone="warning">{riskyObjectives.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {riskyObjectives.length === 0 ? (
          <EmptyState title="No filtered risks" description="No at-risk or off-track direct-report OKRs match the filters." />
        ) : (
          riskyObjectives.map((objective) => {
            const owner = users.find((user) => user.id === objective.ownerUserId);
            return (
              <div key={objective.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/okrs/${objective.id}`} className="font-semibold text-ink-950 hover:text-dten-blue">
                      {objective.title}
                    </Link>
                    <p className="mt-1 text-sm text-ink-600">
                      {owner?.name ?? "Unknown owner"} / {getTeamName(objective.teamId)}
                    </p>
                  </div>
                  <StatusBadge status={objective.status} />
                </div>
                <div className="mt-3">
                  <ProgressBar value={objective.score} label={`${objective.confidence} confidence`} />
                </div>
                <div className="mt-4">
                  <Link href={`/okrs/${objective.id}`}>
                    <Button variant="secondary">Open OKR detail</Button>
                  </Link>
                </div>
                <CommentBox
                  resourceKey={`objective:${objective.id}`}
                  comments={allComments.filter((comment) => comment.resourceType === "objective" && comment.resourceId === objective.id)}
                  value={commentDrafts[`objective:${objective.id}`] ?? ""}
                  onChange={(value) => setCommentDrafts({ ...commentDrafts, [`objective:${objective.id}`]: value })}
                  onSubmit={() => addComment("objective", objective.id, objective)}
                />
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function ChallengesCard({
  reports,
  comments: allComments,
  commentDrafts,
  setCommentDrafts,
  addComment,
}: {
  reports: WeeklyReport[];
  comments: Comment[];
  commentDrafts: Record<string, string>;
  setCommentDrafts: (drafts: Record<string, string>) => void;
  addComment: (resourceType: ResourceType, resourceId: string, resource: Objective | WeeklyReport) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-950">Reported Challenges This Week</h2>
            <p className="mt-1 text-sm text-ink-600">Latest direct-report risks or blockers from weekly reports.</p>
          </div>
          <Badge tone="neutral">{reports.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {reports.length === 0 ? (
          <EmptyState title="No reported challenges" description="No visible weekly reports include challenges for the selected filters." />
        ) : (
          reports.map((report) => (
            <div key={report.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink-950">{getUserName(report.userId)}</p>
                  <p className="mt-1 text-sm text-ink-600">{formatDate(report.weekStartDate)}</p>
                </div>
                <Badge tone={updateStatusTone(report.okrUpdateStatus)}>{report.okrUpdateStatus}</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-ink-600">{report.challengesComments}</p>
              <div className="mt-4">
                <Link href={`/weekly-history?employeeId=${report.userId}&week=${report.weekStartDate}`}>
                  <Button variant="secondary">Open weekly report</Button>
                </Link>
              </div>
              <CommentBox
                resourceKey={`weekly_report:${report.id}`}
                comments={allComments.filter((comment) => comment.resourceType === "weekly_report" && comment.resourceId === report.id)}
                value={commentDrafts[`weekly_report:${report.id}`] ?? ""}
                onChange={(value) => setCommentDrafts({ ...commentDrafts, [`weekly_report:${report.id}`]: value })}
                onSubmit={() => addComment("weekly_report", report.id, report)}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function RejectedResubmittedCard({ objectives: reviewObjectives, approvals: allApprovals }: { objectives: Objective[]; approvals: Approval[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-950">Rejected / Resubmitted OKRs</h2>
            <p className="mt-1 text-sm text-ink-600">OKRs that need revision attention or have returned for review.</p>
          </div>
          <Badge tone="warning">{reviewObjectives.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {reviewObjectives.length === 0 ? (
          <EmptyState title="No rejected or resubmitted OKRs" description="No filtered direct-report OKRs are in a revision review state." />
        ) : (
          reviewObjectives.map((objective) => {
            const approval = allApprovals.find((item) => item.objectiveId === objective.id);
            return (
              <div key={objective.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink-950">{objective.title}</p>
                    <p className="mt-1 text-sm text-ink-600">
                      {getUserName(objective.ownerUserId)} / {objective.approvalState}
                    </p>
                    {approval?.approvalNote ? <p className="mt-2 text-sm leading-6 text-ink-600">{approval.approvalNote}</p> : null}
                    <div className="mt-3">
                      <Link href={`/okrs/${objective.id}`}>
                        <Button variant="secondary">Open OKR detail</Button>
                      </Link>
                    </div>
                  </div>
                  <Badge tone={objective.approvalState === "Rejected" ? "danger" : "warning"}>{objective.approvalState}</Badge>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function CommentBox({
  resourceKey,
  comments: resourceComments,
  value,
  onChange,
  onSubmit,
}: {
  resourceKey: string;
  comments: Comment[];
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  void resourceKey;
  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="space-y-2">
        {resourceComments.slice(0, 2).map((comment) => (
          <p key={comment.id} className="text-sm leading-6 text-ink-600">
            <span className="font-semibold text-ink-800">{getUserName(comment.authorUserId)}:</span> {comment.body}
          </p>
        ))}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
        <input
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-ink-800 outline-none focus:border-dten-blue"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Add a lightweight execution comment."
        />
        <Button variant="secondary" onClick={onSubmit}>
          Add comment
        </Button>
      </div>
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

function getWeekFromStart(weekStartDate: string) {
  const start = new Date(`${weekStartDate}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  return {
    week_start_date: weekStartDate,
    week_end_date: end.toISOString().slice(0, 10),
  };
}

function getDefaultManagerWeekStart() {
  const latestReport = [...weeklyReports].sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))[0];
  return latestReport?.weekStartDate ?? getCurrentWeek().week_start_date;
}

function getTeamName(teamId: string | null) {
  return teamId ? teams.find((team) => team.id === teamId)?.name ?? "No team" : "No team";
}

function getUserName(userId: string) {
  return users.find((user) => user.id === userId)?.name ?? "Unknown user";
}

function getBehindTargetKrs(activeObjectives: Objective[], allKeyResults: KeyResult[]) {
  const objectiveById = new Map(activeObjectives.map((objective) => [objective.id, objective]));

  return allKeyResults
    .filter((keyResult) => objectiveById.has(keyResult.objectiveId))
    .map((keyResult) => ({
      keyResult,
      objective: objectiveById.get(keyResult.objectiveId)!,
    }))
    .filter((item) => deriveKRPacingStatus(item.keyResult, mockCurrentDate) === "Behind")
    .sort((a, b) => a.keyResult.progressPercent - b.keyResult.progressPercent);
}

function getPreviousReportFor(report: WeeklyReport, allReports: WeeklyReport[]) {
  return allReports
    .filter((candidate) => candidate.userId === report.userId && candidate.weekStartDate < report.weekStartDate)
    .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))[0];
}

function formatChangeType(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function findPreviousPriorityForFollowUp(previousPriorityText: string, previousReport?: WeeklyReport) {
  return previousReport?.weeklyPriorities?.find((priority) => priority.text.trim() === previousPriorityText.trim());
}

function applyManagerReviewState(report: WeeklyReport, managerUserId: string, managerReviewStatus: ManagerReviewStatus): WeeklyReport {
  const timestamp = new Date().toISOString();

  return {
    ...report,
    managerReviewStatus,
    reviewedByUserId: managerUserId,
    reviewedAt: timestamp,
    updatedAt: timestamp,
  };
}

function formatCheckInProgress(checkIn: { currentValue?: number | null; progressPercent?: number | null }) {
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

function updateStatusTone(status: OkrUpdateStatus) {
  if (status === "Updated") return "success";
  if (status === "Partially Updated") return "warning";
  if (status === "Not Updated") return "danger";
  return "neutral";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
