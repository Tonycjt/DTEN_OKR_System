"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlignmentBadge } from "@/components/ui/alignment-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { VisibilityBadge } from "@/components/ui/visibility-badge";
import {
  addLocalAuditLog,
  addLocalNotification,
  loadLocalOkrStore,
  replaceLocalKeyResults,
  saveLocalOkrStore,
  upsertLocalApproval,
  upsertLocalOkrChangeRequest,
  upsertLocalObjective,
} from "@/lib/local-okr-store";
import { approvals, okrChangeRequests, users } from "@/mock-data";
import { useMockSessionUser } from "@/lib/mock-session";
import {
  findObjective,
  findQuarter,
  findTeam,
  findUser,
  getMergedApprovals,
  getMergedKeyResults,
  getMergedObjectives,
} from "@/lib/mock-lookups";
import { applyRollupAutomation } from "@/lib/okr-rollups";
import { canApproveObjective } from "@/lib/permission-helpers";
import { canManagerApproveOkrChange } from "@/lib/okr-change-request-helpers";
import { mergeById } from "@/lib/merge-by-id";
import type { Approval, AuditLog, KeyResult, Notification, Objective, OkrChangeRequest } from "@/types";

type PendingApprovalItem = {
  objective: Objective;
  approval: Approval;
};

export function ApprovalInboxView() {
  const activeUser = useMockSessionUser();
  const [store, setStore] = useState(() => loadLocalOkrStore());
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const [changeRequestNotes, setChangeRequestNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const refreshStore = () => setStore(loadLocalOkrStore());
    refreshStore();
    window.addEventListener("dten-local-okrs-updated", refreshStore);

    return () => window.removeEventListener("dten-local-okrs-updated", refreshStore);
  }, []);

  const mergedObjectives = useMemo(() => getMergedObjectives(store.objectives), [store.objectives]);
  const mergedApprovals = useMemo(() => getMergedApprovals(approvals, store.approvals), [store.approvals]);
  const mergedKeyResults = useMemo(() => getMergedKeyResults(store.keyResults), [store.keyResults]);
  const mergedChangeRequests = useMemo(() => mergeById(okrChangeRequests, store.okrChangeRequests), [store.okrChangeRequests]);

  const pendingItems = useMemo(() => {
    if (activeUser.role !== "Manager") {
      return [];
    }

    const permissionContext = {
      users,
      objectives: mergedObjectives,
      keyResults: mergedKeyResults,
    };

    return mergedApprovals
      .filter((approval) => approval.approvalStatus === "Pending" && approval.approverUserId === activeUser.id)
      .map((approval) => ({
        approval,
        objective: mergedObjectives.find((objective) => objective.id === approval.objectiveId),
      }))
      .filter((item): item is PendingApprovalItem => {
        if (!item.objective) return false;
        return canApproveObjective(activeUser, item.objective, permissionContext);
      });
  }, [activeUser, mergedApprovals, mergedKeyResults, mergedObjectives]);

  const visibleChangeRequests = useMemo(() => {
    if (activeUser.role !== "Manager" && activeUser.role !== "Admin") {
      return [];
    }

    return mergedChangeRequests
      .filter((changeRequest) => changeRequest.approverUserId === activeUser.id || activeUser.role === "Admin")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [activeUser, mergedChangeRequests]);

  const pendingChangeRequests = visibleChangeRequests.filter((changeRequest) => changeRequest.status === "pending");

  function decideApproval(item: PendingApprovalItem, decision: "Approved" | "Rejected") {
    setMessage(null);

    const owner = findUser(item.objective.ownerUserId);
    const permissionContext = {
      users,
      objectives: mergedObjectives,
      keyResults: mergedKeyResults,
    };

    if (activeUser.role !== "Manager") {
      setMessage("Only users with the Manager role can approve OKRs in this prototype.");
      return;
    }

    if (!owner || !canApproveObjective(activeUser, item.objective, permissionContext)) {
      setMessage("This manager can only approve direct reports in the prototype.");
      return;
    }

    if (item.objective.ownerUserId === activeUser.id) {
      setMessage("Users cannot approve their own OKRs.");
      return;
    }

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
    setMessage(decision === "Approved" ? "OKR approved and activated." : "OKR rejected and returned to the owner.");
  }

  function decideChangeRequest(changeRequest: OkrChangeRequest, decision: "approved" | "rejected") {
    setMessage(null);

    if (!canManagerApproveOkrChange(activeUser, changeRequest)) {
      setMessage("This mock user cannot review that OKR change request.");
      return;
    }

    const note = changeRequestNotes[changeRequest.id]?.trim() ?? "";
    if (!note) {
      setMessage("Add a manager note before reviewing an OKR change request.");
      return;
    }

    const objective = mergedObjectives.find((item) => item.id === changeRequest.objectiveId);
    if (!objective) {
      setMessage("The objective for this change request was not found.");
      return;
    }

    const timestamp = new Date().toISOString();
    const decidedRequest: OkrChangeRequest = {
      ...changeRequest,
      status: decision,
      managerNote: note,
      decidedAt: timestamp,
    };
    let nextStore = upsertLocalOkrChangeRequest(loadLocalOkrStore(), decidedRequest);

    if (decision === "approved") {
      const objectiveKeyResults = mergedKeyResults.filter((keyResult) => keyResult.objectiveId === objective.id);
      const applied = applyOkrChangeRequest(objective, objectiveKeyResults, changeRequest);
      nextStore = upsertLocalObjective(nextStore, {
        ...applied.objective,
        updatedByUserId: activeUser.id,
        updatedAt: timestamp,
      });
      nextStore = replaceLocalKeyResults(nextStore, objective.id, applied.keyResults);
      nextStore = applyRollupAutomation(nextStore);
    }

    nextStore = addLocalNotification(nextStore, {
      id: `local-notification-${crypto.randomUUID()}`,
      userId: objective.ownerUserId,
      type: decision === "approved" ? "approval_approved" : "approval_rejected",
      resourceType: "objective",
      resourceId: changeRequest.objectiveId,
      channel: "in_app",
      sentAt: timestamp,
      readAt: null,
      status: "Sent",
    });
    nextStore = addLocalAuditLog(nextStore, {
      id: `local-audit-${crypto.randomUUID()}`,
      actorUserId: activeUser.id,
      actionType: decision === "approved" ? "okr_change_request_approved" : "okr_change_request_rejected",
      targetType: "objective",
      targetId: changeRequest.objectiveId,
      metadata: { changeRequestId: changeRequest.id, prototype: true },
      createdAt: timestamp,
    });

    saveLocalOkrStore(nextStore);
    setStore(nextStore);
    setMessage(decision === "approved" ? "OKR change request approved and applied." : "OKR change request rejected; original OKR is unchanged.");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        description={`Pending individual OKRs for the selected mock user. Prototype scope only; no email is sent.`}
      />

      {message ? <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-dten-blue">{message}</div> : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink-950">Approval Inbox</h2>
              <p className="mt-1 text-sm text-ink-600">Managers can approve or reject only direct-report individual OKRs.</p>
            </div>
            <Badge tone="warning">{pendingItems.length} pending</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeUser.role !== "Manager" ? (
            <EmptyState
              title="Manager access required"
              description={`${activeUser.name} is a ${activeUser.role}. Select a Manager user in the top bar to review direct-report approvals.`}
            />
          ) : pendingItems.length === 0 ? (
            <EmptyState title="No pending approvals" description="There are no direct-report individual OKRs waiting for this manager." />
          ) : (
            pendingItems.map((item) => {
              const owner = findUser(item.objective.ownerUserId);
              const team = findTeam(item.objective.teamId);
              const quarter = findQuarter(item.objective.quarterId);
              const parentObjective = item.objective.parentObjectiveId ? findObjective(item.objective.parentObjectiveId) : undefined;
              const previewKeyResults = mergedKeyResults.filter((keyResult) => keyResult.objectiveId === item.objective.id).slice(0, 3);

              return (
                <div key={item.approval.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/okrs/${item.objective.id}`} className="text-base font-semibold text-ink-950 hover:text-dten-blue">
                          {item.objective.title}
                        </Link>
                        <VisibilityBadge visibility={item.objective.visibility} />
                        <AlignmentBadge linked={Boolean(item.objective.parentObjectiveId)} />
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-ink-600 md:grid-cols-2">
                        <p>
                          <span className="font-semibold text-ink-800">Employee:</span> {owner?.name ?? "Unknown"}
                        </p>
                        <p>
                          <span className="font-semibold text-ink-800">Team:</span> {team?.name ?? "No team"}
                        </p>
                        <p>
                          <span className="font-semibold text-ink-800">Quarter:</span> {quarter?.label ?? item.objective.quarterId}
                        </p>
                        <p>
                          <span className="font-semibold text-ink-800">Submitted:</span> {formatDate(item.approval.createdAt)}
                        </p>
                      </div>
                      <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-ink-600">
                        <span className="font-semibold text-ink-800">Alignment parent:</span>{" "}
                        {parentObjective ? parentObjective.title : "Unlinked"}
                      </div>
                      <div className="mt-4 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Quick KR preview</p>
                        {previewKeyResults.length === 0 ? (
                          <p className="text-sm text-ink-600">No key results found.</p>
                        ) : (
                          previewKeyResults.map((keyResult) => (
                            <div key={keyResult.id} className="rounded-md border border-slate-200 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-ink-950">{keyResult.title}</p>
                                <StatusBadge status={keyResult.status} />
                              </div>
                              <div className="mt-3">
                                <ProgressBar value={keyResult.progressPercent} label={keyResult.metricType} />
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <button
                        type="button"
                        onClick={() => decideApproval(item, "Approved")}
                        className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-dten-green bg-dten-green px-4 text-sm font-semibold text-white transition hover:bg-green-700"
                      >
                        Approve
                      </button>
                      <label className="block space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">Rejection note</span>
                        <textarea
                          className="min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-ink-800 outline-none focus:border-dten-blue"
                          value={rejectNotes[item.approval.id] ?? ""}
                          onChange={(event) => setRejectNotes({ ...rejectNotes, [item.approval.id]: event.target.value })}
                          placeholder="Required if rejecting."
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => decideApproval(item, "Rejected")}
                        className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-red-200 bg-white px-4 text-sm font-semibold text-dten-red transition hover:bg-red-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink-950">OKR Change Requests</h2>
              <p className="mt-1 text-sm text-ink-600">Approved OKRs require manager review before material changes apply.</p>
            </div>
            <Badge tone="warning">{pendingChangeRequests.length} pending</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeUser.role !== "Manager" && activeUser.role !== "Admin" ? (
            <EmptyState title="Manager access required" description="Select a Manager or Admin mock user to review OKR change requests." />
          ) : visibleChangeRequests.length === 0 ? (
            <EmptyState title="No OKR change requests" description="Pending and decided material change requests will appear here." />
          ) : (
            visibleChangeRequests.map((changeRequest) => {
              const objective = mergedObjectives.find((item) => item.id === changeRequest.objectiveId);
              const requester = findUser(changeRequest.requestedByUserId);

              return (
                <div key={changeRequest.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {objective ? (
                          <Link href={`/okrs/${objective.id}`} className="text-base font-semibold text-ink-950 hover:text-dten-blue">
                            {objective.title}
                          </Link>
                        ) : (
                          <p className="text-base font-semibold text-ink-950">Unknown objective</p>
                        )}
                        <ChangeRequestStatusBadge status={changeRequest.status} />
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-ink-600 md:grid-cols-2">
                        <p>
                          <span className="font-semibold text-ink-800">Requested by:</span> {requester?.name ?? "Unknown"}
                        </p>
                        <p>
                          <span className="font-semibold text-ink-800">Created:</span> {formatDate(changeRequest.createdAt)}
                        </p>
                      </div>
                      <div className="mt-3 rounded-md bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Requested material changes</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(changeRequest.requestedChanges.materialChangeTypes ?? []).map((changeType) => (
                            <Badge key={changeType} tone="neutral">
                              {formatChangeType(changeType)}
                            </Badge>
                          ))}
                        </div>
                        <p className="mt-3 text-sm leading-6 text-ink-600">{changeRequest.reason}</p>
                      </div>
                      {changeRequest.managerNote ? (
                        <p className="mt-3 text-sm leading-6 text-ink-600">
                          <span className="font-semibold text-ink-800">Manager note:</span> {changeRequest.managerNote}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                      {changeRequest.status === "pending" ? (
                        <>
                          <label className="block space-y-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">Manager note</span>
                            <textarea
                              className="min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-ink-800 outline-none focus:border-dten-blue"
                              value={changeRequestNotes[changeRequest.id] ?? ""}
                              onChange={(event) => setChangeRequestNotes({ ...changeRequestNotes, [changeRequest.id]: event.target.value })}
                              placeholder="Required for approve or reject."
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => decideChangeRequest(changeRequest, "approved")}
                            className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-dten-green bg-dten-green px-4 text-sm font-semibold text-white transition hover:bg-green-700"
                          >
                            Approve Change
                          </button>
                          <button
                            type="button"
                            onClick={() => decideChangeRequest(changeRequest, "rejected")}
                            className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-red-200 bg-white px-4 text-sm font-semibold text-dten-red transition hover:bg-red-50"
                          >
                            Reject Change
                          </button>
                        </>
                      ) : (
                        <p className="text-sm leading-6 text-ink-600">
                          {changeRequest.status === "approved"
                            ? "This requested change has been applied."
                            : "This requested change was rejected; the original OKR remained unchanged."}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function applyOkrChangeRequest(objective: Objective, keyResults: KeyResult[], changeRequest: OkrChangeRequest) {
  const changes = changeRequest.requestedChanges;
  let nextObjective: Objective = { ...objective };
  let nextKeyResults = [...keyResults];

  if (typeof changes.objectiveTitle === "string") nextObjective = { ...nextObjective, title: changes.objectiveTitle };
  if (typeof changes.ownerUserId === "string") nextObjective = { ...nextObjective, ownerUserId: changes.ownerUserId };
  if (changes.visibility) nextObjective = { ...nextObjective, visibility: changes.visibility };
  if ("parentObjectiveId" in changes) nextObjective = { ...nextObjective, parentObjectiveId: changes.parentObjectiveId ?? null };

  if (changes.removeKeyResultId) {
    nextKeyResults = nextKeyResults.filter((keyResult) => keyResult.id !== changes.removeKeyResultId);
  }

  if (changes.addKeyResult) {
    nextKeyResults = [...nextKeyResults, { ...changes.addKeyResult, objectiveId: objective.id }];
  }

  if (changes.keyResultId) {
    nextKeyResults = nextKeyResults.map((keyResult) => {
      if (keyResult.id !== changes.keyResultId) {
        return keyResult;
      }

      return {
        ...keyResult,
        title: changes.keyResultTitle ?? keyResult.title,
        targetValue: typeof changes.keyResultTargetValue === "number" ? changes.keyResultTargetValue : keyResult.targetValue,
        monthlyTargets: changes.monthlyTargets ?? keyResult.monthlyTargets,
        linkedChildObjectiveId: "linkedChildObjectiveId" in changes ? changes.linkedChildObjectiveId ?? null : keyResult.linkedChildObjectiveId,
        rollupMode: "linkedChildObjectiveId" in changes && changes.linkedChildObjectiveId ? "Auto from linked child objective" : keyResult.rollupMode,
      };
    });
  }

  return { objective: nextObjective, keyResults: nextKeyResults };
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
