"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Discussion } from "@/components/comments/discussion";
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
import { KRMonthlyPacingSummary, KRMonthlyTargetsDetail, KRTrackerLinks } from "@/components/okrs/kr-monthly-pacing";
import { OkrProgressUpdateModal } from "@/components/okrs/okr-progress-update-modal";
import { addLocalComment, addLocalNotification, createEmptyLocalOkrStore, loadLocalOkrStore, replaceLocalKeyResults, saveLocalOkrStore } from "@/lib/local-okr-store";
import { mergeById } from "@/lib/merge-by-id";
import { checkIns, comments, keyResults, objectives, okrChangeRequests, users, weeklyReports } from "@/mock-data";
import { useMockSessionUser } from "@/lib/mock-session";
import { canUserRequestOkrChange } from "@/lib/okr-change-request-helpers";
import { calculateObjectiveScoreFromKeyResults, getEffectiveKeyResults, isObjectiveEligibleForRollup } from "@/lib/okr-rollups";
import { canCommentOnResource, canEditObjective, canManageKeyResultTrackerLinks, canViewObjective, type PermissionContext } from "@/lib/permission-helpers";
import {
  getApprovalsForObjective,
  getDepartmentById,
  getKeyResultsForObjective,
  getObjectiveById,
  getQuarterById,
  getTeamById,
  getUserById,
} from "@/lib/selectors";
import type { CheckIn, Comment, KeyResult, Notification, Objective, OkrChangeRequest, ResourceType, TrackerLink, User, WeeklyReport } from "@/types";

type OkrDetailViewProps = {
  objectiveId: string;
};

export function OkrDetailView({ objectiveId }: OkrDetailViewProps) {
  const activeUser = useMockSessionUser();
  const [localStore, setLocalStore] = useState(() => createEmptyLocalOkrStore());
  const [showProgressUpdate, setShowProgressUpdate] = useState(false);

  useEffect(() => {
    const refreshLocalStore = () => setLocalStore(loadLocalOkrStore());
    refreshLocalStore();
    window.addEventListener("dten-local-okrs-updated", refreshLocalStore);

    return () => window.removeEventListener("dten-local-okrs-updated", refreshLocalStore);
  }, []);

  const objective = useMemo(() => {
    return getObjectiveById(objectiveId, localStore);
  }, [localStore, objectiveId]);

  if (!objective) {
    return (
      <div className="space-y-6">
        <PageHeader title="OKR not found" description="This objective does not exist in mock data or local prototype storage." />
        <EmptyState title="No OKR found" description="Return to My OKRs and choose an available objective." />
      </div>
    );
  }

  const mergedObjectives = mergeById(objectives, localStore.objectives);
  const mergedKeyResults = mergeById(keyResults, localStore.keyResults);
  const mergedCheckIns = mergeById(checkIns, localStore.checkIns);
  const mergedWeeklyReports = mergeById(weeklyReports, localStore.weeklyReports);
  const mergedChangeRequests = mergeById(okrChangeRequests, localStore.okrChangeRequests);
  const permissionContext = {
    users,
    objectives: mergedObjectives,
    keyResults: mergedKeyResults,
  };

  if (!canViewObjective(activeUser, objective, permissionContext)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Restricted OKR" description="This objective is not visible to the selected mock user." />
        <EmptyState title="No access" description="Select another mock user or open an OKR visible to the current user." />
      </div>
    );
  }

  const owner = getUserById(objective.ownerUserId);
  const department = getDepartmentById(objective.departmentId);
  const team = getTeamById(objective.teamId);
  const quarter = getQuarterById(objective.quarterId);
  const rawParentObjective = objective.parentObjectiveId ? getObjectiveById(objective.parentObjectiveId, localStore) : undefined;
  const parentObjective =
    rawParentObjective && canViewObjective(activeUser, rawParentObjective, permissionContext) ? rawParentObjective : undefined;
  const parentOwner = parentObjective ? getUserById(parentObjective.ownerUserId) : undefined;
  const objectiveKeyResults = getEffectiveKeyResults(getKeyResultsForObjective(objective.id, localStore), mergedObjectives);
  const objectiveKeyResultIds = new Set(objectiveKeyResults.map((keyResult) => keyResult.id));
  const relatedCheckIns = mergedCheckIns
    .filter((checkIn) => checkIn.objectiveId === objective.id || Boolean(checkIn.keyResultId && objectiveKeyResultIds.has(checkIn.keyResultId)))
    .sort((a, b) => b.checkInDate.localeCompare(a.checkInDate) || b.createdAt.localeCompare(a.createdAt));
  const latestWeeklyCheckIn = relatedCheckIns[0];
  const relatedWeeklyReports = getRelatedWeeklyReports(objective, relatedCheckIns, mergedWeeklyReports).slice(0, 6);
  const objectiveApprovals = getApprovalsForObjective(objective.id, localStore);
  const objectiveChangeRequests = mergedChangeRequests
    .filter((changeRequest) => changeRequest.objectiveId === objective.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const mergedComments = mergeById(comments, localStore.comments);
  const objectiveComments = mergedComments.filter((comment) => comment.resourceType === "objective" && comment.resourceId === objective.id);
  const objectiveOwnerUserId = objective.ownerUserId;
  const displayedObjectiveScore = objectiveKeyResults.length > 0 ? calculateObjectiveScoreFromKeyResults(objective.id, objectiveKeyResults) : objective.score;
  const canEdit = canEditObjective(activeUser, objective, permissionContext);
  const canRequestChange = canUserRequestOkrChange(activeUser, objective);
  const editActionLabel = objective.approvalState === "Approved" ? "Propose change" : "Edit";
  const canOpenEditAction = objective.approvalState === "Approved" ? canRequestChange : canEdit;

  function addComment(resourceType: ResourceType, resourceId: string, body: string, parentCommentId?: string | null) {
    const parentComment = parentCommentId ? mergedComments.find((item) => item.id === parentCommentId) : undefined;
    if (parentCommentId && (!parentComment || parentComment.resourceType !== resourceType || parentComment.resourceId !== resourceId)) {
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
    const targetUserId = getCommentTargetUserId(resourceType, resourceId, objectiveKeyResults, objectiveOwnerUserId, parentComment);
    let nextStore = addLocalComment(loadLocalOkrStore(), comment);

    if (targetUserId && targetUserId !== activeUser.id) {
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
    setLocalStore(nextStore);
  }

  function updateKeyResultTrackerLinks(keyResultId: string, trackerLinks: TrackerLink[]) {
    const keyResult = mergedKeyResults.find((item) => item.id === keyResultId);
    if (!keyResult || !canManageKeyResultTrackerLinks(activeUser, keyResult, permissionContext)) {
      return;
    }

    const nextObjectiveKeyResults = mergedKeyResults
      .filter((item) => item.objectiveId === keyResult.objectiveId)
      .map((item) => (item.id === keyResultId ? { ...item, trackerLinks } : item));
    const nextStore = replaceLocalKeyResults(loadLocalOkrStore(), keyResult.objectiveId, nextObjectiveKeyResults);
    saveLocalOkrStore(nextStore);
    setLocalStore(nextStore);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={objective.title}
        description={`${objective.description} Viewing as ${activeUser.name} (${activeUser.role}).`}
        actions={
          <div className="flex gap-2">
            {canEdit ? (
              <button
                type="button"
                onClick={() => setShowProgressUpdate(true)}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-dten-blue bg-dten-blue px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Update progress
              </button>
            ) : null}
            <Link
              href="/weekly-update"
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-ink-800 transition hover:bg-slate-50"
            >
              Update this OKR this week
            </Link>
            <Link
              href={`/okrs/${objective.id}/edit`}
              className={`inline-flex min-h-10 items-center justify-center rounded-md border px-4 text-sm font-semibold transition ${
                canOpenEditAction
                  ? "border-dten-blue bg-dten-blue text-white hover:bg-blue-700"
                  : "pointer-events-none border-slate-200 bg-slate-100 text-ink-600"
              }`}
            >
              {editActionLabel}
            </Link>
            <Link
              href="/my-okrs"
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-ink-800 transition hover:bg-slate-50"
            >
              Back to My OKRs
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink-950">Objective</h2>
                <p className="mt-1 text-sm text-ink-600">The intended outcome this OKR is driving.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={objective.status} />
                <ConfidenceBadge confidence={objective.confidence} />
                <ApprovalStateBadge approvalState={objective.approvalState} />
                <VisibilityBadge visibility={objective.visibility} />
                <AlignmentBadge linked={Boolean(objective.parentObjectiveId)} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-md border border-blue-100 bg-blue-50/40 p-4">
              <Badge tone="info">Objective</Badge>
              <h3 className="mt-3 text-lg font-semibold leading-7 text-ink-950">{objective.title}</h3>
              <p className="mt-2 text-sm leading-6 text-ink-600">{objective.description}</p>
            </div>
            <ProgressBar value={displayedObjectiveScore} label="Objective score" />
            <p className="text-sm leading-6 text-ink-600">Score = progress. Status = execution health. Confidence = owner judgment.</p>
            <div className="grid gap-4 md:grid-cols-2">
              <DetailItem label="Owner" value={owner?.name ?? "Unknown owner"} />
              <DetailItem label="Status" value={objective.status} />
              <DetailItem label="Confidence" value={objective.confidence} />
              <DetailItem label="Score" value={`${displayedObjectiveScore}%`} />
              <DetailItem label="Visibility" value={objective.visibility} />
              <DetailItem label="Approval state" value={objective.approvalState} />
              <DetailItem label="Quarter" value={quarter?.label ?? objective.quarterId} />
              <DetailItem label="Department" value={department?.name ?? "No department"} />
              <DetailItem label="Team" value={team?.name ?? "No team"} />
              <DetailItem label="Level" value={objective.level} />
              <DetailItem label="Last updated" value={formatDate(objective.updatedAt)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-ink-950">Alignment</h2>
            <p className="mt-1 text-sm text-ink-600">Objective-to-objective visibility link only.</p>
          </CardHeader>
          <CardContent>
            {parentObjective ? (
              <Link href={`/okrs/${parentObjective.id}`} className="block rounded-md border border-slate-200 bg-slate-50 p-4 hover:bg-blue-50/40">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="info">Parent objective</Badge>
                  <Badge tone="neutral">{parentObjective.level}</Badge>
                </div>
                <p className="mt-3 text-sm font-semibold leading-6 text-ink-950">{parentObjective.title}</p>
                <p className="mt-2 text-sm text-ink-600">Owner: {parentOwner?.name ?? "Unknown owner"}</p>
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <Badge tone="neutral">Current objective</Badge>
                  <p className="mt-2 text-sm font-semibold leading-6 text-ink-950">{objective.title}</p>
                </div>
              </Link>
            ) : objective.parentObjectiveId ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <Badge tone="info">Linked</Badge>
                <p className="mt-3 text-sm text-ink-600">Aligned to a parent objective that is not visible to the selected mock user.</p>
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <Badge tone="neutral">Current objective</Badge>
                  <p className="mt-2 text-sm font-semibold leading-6 text-ink-950">{objective.title}</p>
                </div>
              </div>
            ) : (
              <EmptyState title="No parent objective" description="This OKR is currently unlinked for alignment visibility." />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-ink-950">Key Results</h2>
          <p className="mt-1 text-sm text-ink-600">Measurable results that contribute to the objective score.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {objectiveKeyResults.length === 0 ? (
            <EmptyState title="No key results" description="This objective does not have key results yet." />
          ) : (
            objectiveKeyResults.map((keyResult, index) => {
              const keyResultOwner = getUserById(keyResult.ownerUserId);

              return (
              <div key={keyResult.id} className="rounded-lg border border-slate-200 border-l-blue-300 border-l-4 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="info">KR {index + 1}</Badge>
                      <h3 className="text-base font-semibold text-ink-950">{keyResult.title}</h3>
                      <StatusBadge status={keyResult.status} />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-ink-600">{keyResult.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge tone="neutral">{keyResult.metricType}</Badge>
                      <Badge tone={keyResult.rollupMode === "Manual" ? "neutral" : "info"}>{keyResult.rollupMode}</Badge>
                    </div>
                    <div className="mt-3">
                      <KRMonthlyPacingSummary keyResult={keyResult} />
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <DetailItem label="Current" value={formatMetricValue(keyResult.currentValue)} />
                      <DetailItem label="Target" value={formatMetricValue(keyResult.targetValue)} />
                      <DetailItem label="Owner" value={keyResultOwner?.name ?? "Unknown owner"} />
                      {keyResult.dueDate ? <DetailItem label="Timing date" value={formatDateOnly(keyResult.dueDate)} /> : null}
                    </div>
                    <KRMonthlyTargetsDetail keyResult={keyResult} />
                    <KRTrackerLinks
                      keyResult={keyResult}
                      canEdit={canManageKeyResultTrackerLinks(activeUser, keyResult, permissionContext)}
                      currentUserId={activeUser.id}
                      onChange={(trackerLinks) => updateKeyResultTrackerLinks(keyResult.id, trackerLinks)}
                    />
                    <RollupSourceNote keyResult={keyResult} activeUser={activeUser} objectives={mergedObjectives} permissionContext={permissionContext} />
                  </div>
                  <div className="w-full lg:w-64">
                    <ProgressBar value={keyResult.progressPercent} label="KR progress" />
                  </div>
                </div>
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <h3 className="mb-3 text-sm font-semibold text-ink-950">KR Discussion</h3>
                  <Discussion
                    comments={mergedComments.filter((comment) => comment.resourceType === "key_result" && comment.resourceId === keyResult.id)}
                    canComment={canCommentOnResource(activeUser, keyResult, permissionContext)}
                    getAuthorName={getUserName}
                    onAddComment={(body, parentCommentId) => addComment("key_result", keyResult.id, body, parentCommentId)}
                  />
                </div>
              </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink-950">Change Requests</h2>
              <p className="mt-1 text-sm text-ink-600">
                Approved OKRs keep material changes pending until manager review. Progress updates and tracker links remain separate.
              </p>
            </div>
            <Badge tone={objectiveChangeRequests.some((changeRequest) => changeRequest.status === "pending") ? "warning" : "neutral"}>
              {objectiveChangeRequests.filter((changeRequest) => changeRequest.status === "pending").length} pending
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {objectiveChangeRequests.length === 0 ? (
            <EmptyState title="No change requests" description="Material change requests for this approved OKR will appear here." />
          ) : (
            <div className="space-y-3">
              {objectiveChangeRequests.map((changeRequest) => {
                const requester = getUserById(changeRequest.requestedByUserId);
                const approver = getUserById(changeRequest.approverUserId);

                return (
                  <div key={changeRequest.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <ChangeRequestStatusBadge status={changeRequest.status} />
                        {(changeRequest.requestedChanges.materialChangeTypes ?? []).map((changeType) => (
                          <Badge key={changeType} tone="neutral">
                            {formatChangeType(changeType)}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">{formatDate(changeRequest.createdAt)}</p>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-ink-600">{changeRequest.reason}</p>
                    <div className="mt-3 grid gap-2 text-sm text-ink-600 md:grid-cols-2">
                      <p>
                        <span className="font-semibold text-ink-800">Requested by:</span> {requester?.name ?? "Unknown"}
                      </p>
                      <p>
                        <span className="font-semibold text-ink-800">Manager reviewer:</span> {approver?.name ?? "Unknown"}
                      </p>
                    </div>
                    {changeRequest.managerNote ? (
                      <p className="mt-3 text-sm leading-6 text-ink-600">
                        <span className="font-semibold text-ink-800">Manager note:</span> {changeRequest.managerNote}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink-950">Weekly Updates Linked to This OKR</h2>
              <p className="mt-1 text-sm text-ink-600">Latest Objective/KR check-ins and weekly reports connected to this OKR.</p>
            </div>
            <Badge tone="info">{relatedWeeklyReports.length} related reports</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-ink-950">Latest weekly check-in</h3>
            {latestWeeklyCheckIn ? (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="neutral">{latestWeeklyCheckIn.resourceType === "key_result" ? "Key Result" : "Objective"}</Badge>
                  {latestWeeklyCheckIn.keyResultStatus ? <StatusBadge status={latestWeeklyCheckIn.keyResultStatus} /> : null}
                  {latestWeeklyCheckIn.objectiveStatus ? <StatusBadge status={latestWeeklyCheckIn.objectiveStatus} /> : null}
                  {latestWeeklyCheckIn.confidence ? <ConfidenceBadge confidence={latestWeeklyCheckIn.confidence} /> : null}
                </div>
                <p className="text-sm font-semibold text-ink-950">{getCheckInTitle(latestWeeklyCheckIn, objectiveKeyResults, objective)}</p>
                <p className="text-sm leading-6 text-ink-600">{latestWeeklyCheckIn.notes || latestWeeklyCheckIn.progressUpdate || "No note recorded."}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <DetailItem label="Progress" value={formatCheckInProgress(latestWeeklyCheckIn)} />
                  <DetailItem label="Check-in date" value={formatDateOnly(latestWeeklyCheckIn.checkInDate)} />
                </div>
              </div>
            ) : (
              <EmptyState title="No weekly check-ins" description="This OKR has not been checked in during the current mock data set." />
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-ink-950">Weekly update history</h3>
            {relatedWeeklyReports.length === 0 ? (
              <EmptyState title="No related weekly reports" description="Related reports appear after this Objective or its KRs are checked in during a report week." />
            ) : (
              relatedWeeklyReports.map((report) => (
                <Link key={report.id} href={`/weekly-history?employeeId=${report.userId}&week=${report.weekStartDate}`} className="block rounded-lg border border-slate-200 p-4 hover:bg-blue-50/30">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink-950">{formatDateOnly(report.weekStartDate)} weekly update</p>
                    <Badge tone={report.okrUpdateStatus === "Updated" ? "success" : report.okrUpdateStatus === "Partially Updated" ? "warning" : "neutral"}>{report.okrUpdateStatus}</Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-600">{report.challengesComments || report.nextWeekPriorities.filter(Boolean).join("; ") || "No weekly report summary."}</p>
                </Link>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-ink-950">Comments</h2>
            <p className="mt-1 text-sm text-ink-600">Discussion will remain lightweight and record-bound.</p>
          </CardHeader>
          <CardContent>
            <Discussion
              comments={objectiveComments}
              canComment={canCommentOnResource(activeUser, objective, permissionContext)}
              getAuthorName={getUserName}
              onAddComment={(body, parentCommentId) => addComment("objective", objective.id, body, parentCommentId)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-ink-950">Approval History</h2>
            <p className="mt-1 text-sm text-ink-600">Formal approval actions stay separate from comments.</p>
          </CardHeader>
          <CardContent>
            {objectiveApprovals.length === 0 ? (
              <EmptyState title="Approval history placeholder" description="No approval history is recorded for this objective." />
            ) : (
              <div className="space-y-3">
                {objectiveApprovals.map((approval) => {
                  const approver = getUserById(approval.approverUserId);

                  return (
                    <div key={approval.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-ink-950">{approval.approvalStatus}</p>
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">
                          {approval.approvalTimestamp ? formatDate(approval.approvalTimestamp) : "Pending"}
                        </p>
                      </div>
                      <p className="mt-2 text-sm text-ink-600">Approver: {approver?.name ?? "Unknown approver"}</p>
                      {approval.approvalNote ? <p className="mt-2 text-sm leading-6 text-ink-600">{approval.approvalNote}</p> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {showProgressUpdate ? (
        <OkrProgressUpdateModal
          objective={objective}
          keyResults={objectiveKeyResults}
          onClose={() => setShowProgressUpdate(false)}
          onSaved={() => setLocalStore(loadLocalOkrStore())}
        />
      ) : null}
    </div>
  );
}

function getCommentTargetUserId(
  resourceType: ResourceType,
  resourceId: string,
  objectiveKeyResults: KeyResult[],
  objectiveOwnerUserId: string,
  parentComment?: Comment,
) {
  if (parentComment) {
    return parentComment.authorUserId;
  }

  if (resourceType === "key_result") {
    return objectiveKeyResults.find((keyResult) => keyResult.id === resourceId)?.ownerUserId ?? objectiveOwnerUserId;
  }

  return objectiveOwnerUserId;
}

function getRelatedWeeklyReports(objective: Objective, relatedCheckIns: CheckIn[], reports: WeeklyReport[]) {
  return reports
    .filter((report) => {
      if (report.userId !== objective.ownerUserId) {
        return false;
      }

      return relatedCheckIns.some((checkIn) => checkIn.checkInDate >= report.weekStartDate && checkIn.checkInDate <= report.weekEndDate);
    })
    .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
}

function getCheckInTitle(checkIn: CheckIn, objectiveKeyResults: KeyResult[], objective: Objective) {
  if (checkIn.resourceType === "key_result" && checkIn.keyResultId) {
    return objectiveKeyResults.find((keyResult) => keyResult.id === checkIn.keyResultId)?.title ?? "Key Result check-in";
  }

  return objective.title;
}

function formatCheckInProgress(checkIn: CheckIn) {
  const progress = typeof checkIn.progressPercent === "number" ? `${checkIn.progressPercent}%` : null;
  const current = typeof checkIn.currentValue === "number" ? String(checkIn.currentValue) : null;

  if (current && progress) {
    return `${current} / ${progress}`;
  }

  return current ?? progress ?? "No progress value";
}

function RollupSourceNote({
  keyResult,
  activeUser,
  objectives: allObjectives,
  permissionContext,
}: {
  keyResult: KeyResult;
  activeUser: User;
  objectives: Objective[];
  permissionContext: PermissionContext;
}) {
  if (!keyResult.linkedChildObjectiveId) {
    return null;
  }

  const childObjective = allObjectives.find((objective) => objective.id === keyResult.linkedChildObjectiveId);
  const canViewChildObjective = Boolean(childObjective && canViewObjective(activeUser, childObjective, permissionContext));

  if (!childObjective || !canViewChildObjective) {
    return (
      <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
        <Badge tone="info">Auto-updated from linked objective</Badge>
        <p className="mt-2 text-sm text-ink-600">Auto-updated from a linked objective.</p>
      </div>
    );
  }

  const owner = getUserById(childObjective.ownerUserId);
  const eligible = isObjectiveEligibleForRollup(childObjective);

  return (
    <div className={`mt-3 rounded-md border px-3 py-2 ${eligible ? "border-blue-100 bg-blue-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex flex-wrap gap-2">
        <Badge tone="info">Auto-updated from linked objective</Badge>
        {!eligible ? <Badge tone="warning">Pending</Badge> : null}
      </div>
      <p className="mt-2 text-sm text-ink-600">
        {eligible
          ? `Progress source: linked objective owned by ${owner?.name ?? "Unknown owner"}.`
          : "Pending state: linked child objective must be approved and active before roll-up can update this KR."}
      </p>
    </div>
  );
}

function getUserName(userId: string) {
  return getUserById(userId)?.name ?? "Unknown user";
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">{label}</p>
      <p className="mt-2 text-sm font-semibold capitalize text-ink-950">{value}</p>
    </div>
  );
}

function ChangeRequestStatusBadge({ status }: { status: OkrChangeRequest["status"] }) {
  if (status === "approved") return <Badge tone="success">Approved</Badge>;
  if (status === "rejected") return <Badge tone="danger">Rejected</Badge>;
  return <Badge tone="warning">Pending</Badge>;
}

function formatChangeType(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatMetricValue(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "Not set";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
