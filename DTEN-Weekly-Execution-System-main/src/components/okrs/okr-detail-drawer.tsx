"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AlignmentBadge } from "@/components/ui/alignment-badge";
import { ApprovalStateBadge } from "@/components/ui/approval-state-badge";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { VisibilityBadge } from "@/components/ui/visibility-badge";
import { KRMonthlyPacingSummary, KRMonthlyTargetsDetail, KRTrackerLinks } from "@/components/okrs/kr-monthly-pacing";
import { OkrProgressUpdateModal } from "@/components/okrs/okr-progress-update-modal";
import { createEmptyLocalOkrStore, loadLocalOkrStore, replaceLocalKeyResults, saveLocalOkrStore } from "@/lib/local-okr-store";
import { mergeById } from "@/lib/merge-by-id";
import { useMockSessionUser } from "@/lib/mock-session";
import { calculateObjectiveScoreFromKeyResults, getEffectiveKeyResults } from "@/lib/okr-rollups";
import { canApproveObjective, canEditObjective, canManageKeyResultTrackerLinks, canViewObjective } from "@/lib/permission-helpers";
import { checkIns, comments, departments, keyResults, objectives, quarters, teams, users } from "@/mock-data";
import type { CheckIn, KeyResult, Objective, TrackerLink } from "@/types";

type OkrDetailDrawerProps = {
  objectiveId: string | null;
  onClose: () => void;
};

export function OkrDetailDrawer({ objectiveId, onClose }: OkrDetailDrawerProps) {
  const activeUser = useMockSessionUser();
  const [localStore, setLocalStore] = useState(() => createEmptyLocalOkrStore());
  const [showProgressUpdate, setShowProgressUpdate] = useState(false);

  useEffect(() => {
    const refreshStore = () => setLocalStore(loadLocalOkrStore());
    refreshStore();
    window.addEventListener("dten-local-okrs-updated", refreshStore);

    return () => window.removeEventListener("dten-local-okrs-updated", refreshStore);
  }, []);

  const mergedObjectives = useMemo(() => mergeById(objectives, localStore.objectives), [localStore.objectives]);
  const mergedKeyResults = useMemo(() => mergeById(keyResults, localStore.keyResults), [localStore.keyResults]);
  const mergedCheckIns = useMemo(() => mergeById(checkIns, localStore.checkIns), [localStore.checkIns]);
  const mergedComments = useMemo(() => mergeById(comments, localStore.comments), [localStore.comments]);
  const objective = objectiveId ? mergedObjectives.find((item) => item.id === objectiveId) : undefined;
  const permissionContext = { users, objectives: mergedObjectives, keyResults: mergedKeyResults };
  const canView = Boolean(objective && canViewObjective(activeUser, objective, permissionContext));

  if (!objectiveId) {
    return null;
  }

  if (!objective || !canView) {
    return (
      <DrawerFrame onClose={onClose}>
        <EmptyState title="OKR unavailable" description="This OKR is not visible to the selected mock user." />
      </DrawerFrame>
    );
  }

  const owner = users.find((user) => user.id === objective.ownerUserId);
  const department = departments.find((item) => item.id === objective.departmentId);
  const team = teams.find((item) => item.id === objective.teamId);
  const quarter = quarters.find((item) => item.id === objective.quarterId);
  const rawParentObjective = objective.parentObjectiveId ? mergedObjectives.find((item) => item.id === objective.parentObjectiveId) : undefined;
  const parentObjective =
    rawParentObjective && canViewObjective(activeUser, rawParentObjective, permissionContext) ? rawParentObjective : undefined;
  const parentOwner = parentObjective ? users.find((user) => user.id === parentObjective.ownerUserId) : undefined;
  const objectiveKeyResults = getEffectiveKeyResults(
    mergedKeyResults.filter((keyResult) => keyResult.objectiveId === objective.id),
    mergedObjectives,
  );
  const displayedScore = objectiveKeyResults.length > 0 ? calculateObjectiveScoreFromKeyResults(objective.id, objectiveKeyResults) : objective.score;
  const objectiveCheckIns = mergedCheckIns.filter((checkIn) => checkIn.objectiveId === objective.id).slice(0, 3);
  const objectiveCommentCount = mergedComments.filter((comment) => comment.resourceType === "objective" && comment.resourceId === objective.id).length;
  const canEdit = canEditObjective(activeUser, objective, permissionContext);
  const canSubmit = canEdit && ["Draft", "Rejected", "Changes Pending Re-approval"].includes(objective.approvalState);
  const canApprove = canApproveObjective(activeUser, objective, permissionContext);

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
    <DrawerFrame onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">Objective</Badge>
              <Badge tone={levelTone(objective.level)}>{formatLevel(objective.level)}</Badge>
            </div>
            <h2 className="mt-3 text-xl font-semibold leading-7 text-ink-950">{objective.title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">{objective.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-ink-600 hover:bg-slate-50"
            aria-label="Close OKR detail panel"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <button
              type="button"
              onClick={() => setShowProgressUpdate(true)}
              className="inline-flex min-h-9 items-center justify-center rounded-md border border-dten-blue bg-dten-blue px-3 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Update progress
            </button>
          ) : null}
          {canEdit ? <DrawerLink href={`/okrs/${objective.id}/edit`}>Edit OKR</DrawerLink> : null}
          {canSubmit ? <DrawerLink href={`/okrs/${objective.id}/edit`}>Submit for approval</DrawerLink> : null}
          {canApprove ? <DrawerLink href="/approvals">Approve / reject</DrawerLink> : null}
          <DrawerLink href={`/okrs/${objective.id}`}>Open full detail</DrawerLink>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink-950">Progress Summary</h3>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={objective.status} />
              <ConfidenceBadge confidence={objective.confidence} />
            </div>
          </div>
          <div className="mt-4">
            <ProgressBar value={displayedScore} label="Objective score" />
          </div>
          <p className="mt-3 text-sm leading-6 text-ink-600">Score = progress. Status = execution health. Confidence = owner judgment.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <DetailItem label="Owner" value={owner?.name ?? "Unknown owner"} />
            <DetailItem label="Level" value={formatLevel(objective.level)} />
            <DetailItem label="Department" value={department?.name ?? "No department"} />
            <DetailItem label="Team" value={team?.name ?? "No team"} />
            <DetailItem label="Quarter" value={quarter?.label ?? objective.quarterId} />
            <DetailItem label="Last updated" value={formatDate(objective.updatedAt)} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <VisibilityBadge visibility={objective.visibility} />
            <ApprovalStateBadge approvalState={objective.approvalState} />
            <AlignmentBadge linked={Boolean(objective.parentObjectiveId)} />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-ink-950">Alignment</h3>
          {parentObjective ? (
            <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 p-3">
              <div className="flex flex-wrap gap-2">
                <Badge tone="info">Parent objective</Badge>
                <Badge tone={levelTone(parentObjective.level)}>{formatLevel(parentObjective.level)}</Badge>
              </div>
              <p className="mt-2 text-sm font-semibold leading-6 text-ink-950">{parentObjective.title}</p>
              <p className="mt-1 text-sm text-ink-600">Owner: {parentOwner?.name ?? "Unknown owner"}</p>
              <div className="mt-3 border-t border-blue-100 pt-3">
                <Badge tone="neutral">Current objective</Badge>
                <p className="mt-2 text-sm font-semibold leading-6 text-ink-950">{objective.title}</p>
              </div>
            </div>
          ) : objective.parentObjectiveId ? (
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
              <Badge tone="info">Linked</Badge>
              <p className="mt-2 text-sm text-ink-600">Aligned to a parent objective that is not visible to the selected mock user.</p>
              <div className="mt-3 border-t border-slate-200 pt-3">
                <Badge tone="neutral">Current objective</Badge>
                <p className="mt-2 text-sm font-semibold leading-6 text-ink-950">{objective.title}</p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-600">This objective is currently unlinked.</p>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink-950">Key Results</h3>
            <Badge tone="neutral">{objectiveKeyResults.length}</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {objectiveKeyResults.length === 0 ? (
              <EmptyState title="No key results" description="This objective does not have key results yet." />
            ) : (
              objectiveKeyResults.map((keyResult, index) => (
                <DrawerKeyResult
                  key={keyResult.id}
                  keyResult={keyResult}
                  index={index}
                  canEditTrackerLinks={canManageKeyResultTrackerLinks(activeUser, keyResult, permissionContext)}
                  currentUserId={activeUser.id}
                  onTrackerLinksChange={(trackerLinks) => updateKeyResultTrackerLinks(keyResult.id, trackerLinks)}
                />
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink-950">Comments / Discussion</h3>
            <Badge tone="neutral">{objectiveCommentCount}</Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-ink-600">Discussion remains lightweight and record-bound. Open the full detail view to read or add comments.</p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink-950">Check-in History</h3>
            <Badge tone="neutral">{objectiveCheckIns.length}</Badge>
          </div>
          <div className="mt-3 space-y-3">
            {objectiveCheckIns.length === 0 ? (
              <p className="text-sm text-ink-600">No check-ins are available for this objective in mock data.</p>
            ) : (
              objectiveCheckIns.map((checkIn) => <CheckInPreview key={checkIn.id} checkIn={checkIn} />)
            )}
          </div>
        </section>
      </div>
      {showProgressUpdate ? (
        <OkrProgressUpdateModal
          objective={objective}
          keyResults={objectiveKeyResults}
          onClose={() => setShowProgressUpdate(false)}
          onSaved={() => setLocalStore(loadLocalOkrStore())}
        />
      ) : null}
    </DrawerFrame>
  );
}

function DrawerFrame({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink-950/20" role="dialog" aria-modal="true">
      <button type="button" className="hidden flex-1 cursor-default lg:block" aria-label="Close OKR detail panel" onClick={onClose} />
      <aside className="h-full w-full overflow-y-auto border-l border-slate-200 bg-surface-50 p-5 shadow-2xl sm:max-w-[520px]">
        {children}
      </aside>
    </div>
  );
}

function DrawerLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-ink-800 transition hover:bg-slate-50"
    >
      {children}
    </Link>
  );
}

function DrawerKeyResult({
  keyResult,
  index,
  canEditTrackerLinks,
  currentUserId,
  onTrackerLinksChange,
}: {
  keyResult: KeyResult;
  index: number;
  canEditTrackerLinks: boolean;
  currentUserId: string;
  onTrackerLinksChange: (trackerLinks: TrackerLink[]) => void;
}) {
  const owner = users.find((user) => user.id === keyResult.ownerUserId);

  return (
    <div className="rounded-lg border border-slate-200 border-l-4 border-l-blue-300 bg-slate-50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">KR {index + 1}</Badge>
            <StatusBadge status={keyResult.status} />
            <Badge tone="neutral">{keyResult.metricType}</Badge>
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-ink-950">{keyResult.title}</p>
        </div>
        <span className="text-sm font-semibold text-ink-700">{keyResult.progressPercent}%</span>
      </div>
      <div className="mt-3">
        <ProgressBar value={keyResult.progressPercent} label="KR progress" />
      </div>
      <div className="mt-3">
        <KRMonthlyPacingSummary keyResult={keyResult} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <DetailItem label="Current / target" value={`${formatMetricValue(keyResult.currentValue)} / ${formatMetricValue(keyResult.targetValue)}`} />
        <DetailItem label="Owner" value={owner?.name ?? "Unknown owner"} />
        {keyResult.dueDate ? <DetailItem label="Timing date" value={formatDateOnly(keyResult.dueDate)} /> : null}
        <DetailItem label="Progress source" value={keyResult.rollupMode} />
      </div>
      <KRMonthlyTargetsDetail keyResult={keyResult} />
      <KRTrackerLinks
        keyResult={keyResult}
        canEdit={canEditTrackerLinks}
        currentUserId={currentUserId}
        onChange={onTrackerLinksChange}
      />
    </div>
  );
}

function CheckInPreview({ checkIn }: { checkIn: CheckIn }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink-950">{checkIn.resourceType === "key_result" ? "KR check-in" : "Objective check-in"}</p>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">{formatDateOnly(checkIn.checkInDate)}</p>
      </div>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-ink-600">{checkIn.notes || checkIn.progressUpdate || "No note recorded."}</p>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink-950">{value}</p>
    </div>
  );
}

function levelTone(level: Objective["level"]) {
  if (level === "company") return "info";
  if (level === "individual") return "neutral";
  return "success";
}

function formatLevel(level: Objective["level"]) {
  return level.charAt(0).toUpperCase() + level.slice(1);
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
