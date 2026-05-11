"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
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
import { KRMonthlyPacingSummary } from "@/components/okrs/kr-monthly-pacing";
import { OkrDetailDrawer } from "@/components/okrs/okr-detail-drawer";
import { keyResults, objectives as seededObjectives, quarters, users } from "@/mock-data";
import { createEmptyLocalOkrStore, loadLocalOkrStore } from "@/lib/local-okr-store";
import { mergeById } from "@/lib/merge-by-id";
import { useMockSessionUser } from "@/lib/mock-session";
import { canViewObjective } from "@/lib/permission-helpers";
import { getCurrentQuarter, getDepartmentById, getObjectivesVisibleToUser, getTeamById } from "@/lib/selectors";
import type { ApprovalState, Confidence, KeyResult, Objective, ObjectiveStatus } from "@/types";

const allValue = "All";

type ObjectiveGroup = {
  title: string;
  description: string;
  objectives: Objective[];
};

export function MyOkrsView() {
  const currentUser = useMockSessionUser();
  const [quarterId, setQuarterId] = useState(getCurrentQuarter().id);
  const [status, setStatus] = useState<ObjectiveStatus | typeof allValue>(allValue);
  const [confidence, setConfidence] = useState<Confidence | typeof allValue>(allValue);
  const [approvalState, setApprovalState] = useState<ApprovalState | typeof allValue>(allValue);
  const [localStore, setLocalStore] = useState(() => createEmptyLocalOkrStore());
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string | null>(null);

  useEffect(() => {
    const refreshLocalStore = () => setLocalStore(loadLocalOkrStore());
    refreshLocalStore();
    window.addEventListener("dten-local-okrs-updated", refreshLocalStore);

    return () => window.removeEventListener("dten-local-okrs-updated", refreshLocalStore);
  }, []);

  const mergedObjectives = useMemo(() => mergeById(seededObjectives, localStore.objectives), [localStore.objectives]);
  const mergedKeyResults = useMemo(() => mergeById(keyResults, localStore.keyResults), [localStore.keyResults]);

  const myObjectives = useMemo(() => {
    return getObjectivesVisibleToUser(currentUser, { objectives: localStore.objectives, keyResults: mergedKeyResults }).filter((objective) => {
      return (
        objective.ownerUserId === currentUser.id &&
        objective.quarterId === quarterId &&
        (status === allValue || objective.status === status) &&
        (confidence === allValue || objective.confidence === confidence) &&
        (approvalState === allValue || objective.approvalState === approvalState)
      );
    });
  }, [approvalState, confidence, currentUser, localStore.objectives, mergedKeyResults, quarterId, status]);

  const groups: ObjectiveGroup[] = [
    {
      title: "Active",
      description: "Approved OKRs currently in the execution rhythm.",
      objectives: myObjectives.filter((objective) => objective.isActive && objective.approvalState === "Approved"),
    },
    {
      title: "Draft",
      description: "Saved OKRs that have not been submitted.",
      objectives: myObjectives.filter((objective) => objective.approvalState === "Draft"),
    },
    {
      title: "Pending Approval",
      description: "Individual OKRs waiting for manager review.",
      objectives: myObjectives.filter((objective) => objective.approvalState === "Pending Approval"),
    },
    {
      title: "Rejected",
      description: "OKRs that need revision before resubmission.",
      objectives: myObjectives.filter((objective) => objective.approvalState === "Rejected"),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My OKRs"
        description={`OKR workspace for ${currentUser.name}, with Objectives clearly separated from Key Results.`}
        actions={
          <Link
            href="/okrs/new"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-dten-blue bg-dten-blue px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Plus size={16} aria-hidden="true" />
            Create OKR
          </Link>
        }
      />

      <Card>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <FilterSelect label="Quarter" value={quarterId} onChange={setQuarterId}>
            {quarters.map((quarter) => (
              <option key={quarter.id} value={quarter.id}>
                {quarter.label}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Status" value={status} onChange={(value) => setStatus(value as ObjectiveStatus | typeof allValue)}>
            <option>{allValue}</option>
            {["Draft", "Active", "At Risk", "Off Track", "Completed", "On Hold", "Archived"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Confidence"
            value={confidence}
            onChange={(value) => setConfidence(value as Confidence | typeof allValue)}
          >
            <option>{allValue}</option>
            {["High", "Medium", "Low"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Approval state"
            value={approvalState}
            onChange={(value) => setApprovalState(value as ApprovalState | typeof allValue)}
          >
            <option>{allValue}</option>
            {["Draft", "Pending Approval", "Approved", "Rejected", "Changes Pending Re-approval", "Archived"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </FilterSelect>
        </CardContent>
      </Card>

      {groups.map((group) => (
        <OkrGroup
          key={group.title}
          group={group}
          keyResults={mergedKeyResults}
          allObjectives={mergedObjectives}
          activeUser={currentUser}
          onOpenObjective={setSelectedObjectiveId}
        />
      ))}

      <OkrDetailDrawer objectiveId={selectedObjectiveId} onClose={() => setSelectedObjectiveId(null)} />
    </div>
  );
}

type FilterSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
};

function FilterSelect({ label, value, onChange, children }: FilterSelectProps) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">{label}</span>
      <select
        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-ink-800"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function OkrGroup({
  group,
  keyResults: allKeyResults,
  allObjectives,
  activeUser,
  onOpenObjective,
}: {
  group: ObjectiveGroup;
  keyResults: KeyResult[];
  allObjectives: Objective[];
  activeUser: ReturnType<typeof useMockSessionUser>;
  onOpenObjective: (objectiveId: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-950">{group.title}</h2>
            <p className="mt-1 text-sm text-ink-600">{group.description}</p>
          </div>
          <Badge tone="neutral">{group.objectives.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {group.objectives.length === 0 ? (
          <EmptyState title={`No ${group.title.toLowerCase()} OKRs`} description="Nothing matches the current filters in this group." />
        ) : (
          group.objectives.map((objective) => (
            <OkrListItem
              key={objective.id}
              objective={objective}
              keyResults={keyResultsForObjective(objective.id, allKeyResults)}
              allObjectives={allObjectives}
              activeUser={activeUser}
              allKeyResults={allKeyResults}
              onOpen={() => onOpenObjective(objective.id)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function OkrListItem({
  objective,
  keyResults: objectiveKeyResults,
  allObjectives,
  activeUser,
  allKeyResults,
  onOpen,
}: {
  objective: Objective;
  keyResults: KeyResult[];
  allObjectives: Objective[];
  activeUser: ReturnType<typeof useMockSessionUser>;
  allKeyResults: KeyResult[];
  onOpen: () => void;
}) {
  const department = getDepartmentById(objective.departmentId);
  const team = getTeamById(objective.teamId);
  const parentObjective = objective.parentObjectiveId ? allObjectives.find((item) => item.id === objective.parentObjectiveId) : undefined;
  const canViewParent = Boolean(
    parentObjective &&
      canViewObjective(activeUser, parentObjective, {
        users,
        objectives: allObjectives,
        keyResults: allKeyResults,
      }),
  );

  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/30"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">Objective</Badge>
            <h3 className="text-base font-semibold text-ink-950">{objective.title}</h3>
            <AlignmentBadge linked={Boolean(objective.parentObjectiveId)} />
          </div>
          {parentObjective && canViewParent ? (
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-dten-blue">Parent: {parentObjective.title}</p>
          ) : objective.parentObjectiveId ? (
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-600">Parent objective restricted</p>
          ) : null}
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-600">{objective.description}</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-600">
            {department?.name ?? "No department"} / {team?.name ?? "No team"}
          </p>
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Key Results</p>
              <Badge tone="neutral">{objectiveKeyResults.length}</Badge>
            </div>
            {objectiveKeyResults.length === 0 ? (
              <p className="mt-2 text-sm text-ink-600">No key results yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {objectiveKeyResults.slice(0, 5).map((keyResult) => (
                  <div key={keyResult.id} className="rounded-md border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 flex-1 text-sm font-semibold leading-5 text-ink-950">{keyResult.title}</p>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Badge tone="neutral">{keyResult.metricType}</Badge>
                        <StatusBadge status={keyResult.status} />
                        {(keyResult.trackerLinks ?? []).length > 0 ? (
                          <Badge tone="info">{(keyResult.trackerLinks ?? []).length} tracker link{(keyResult.trackerLinks ?? []).length === 1 ? "" : "s"}</Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                      <ProgressBar value={keyResult.progressPercent} label="Quarterly progress" />
                      <p className="text-sm font-semibold text-ink-800">{keyResult.progressPercent}% quarterly progress</p>
                    </div>
                    <div className="mt-3">
                      <KRMonthlyPacingSummary keyResult={keyResult} />
                    </div>
                  </div>
                ))}
                {objectiveKeyResults.length > 5 ? (
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">
                    +{objectiveKeyResults.length - 5} more key result{objectiveKeyResults.length - 5 === 1 ? "" : "s"}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
        <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:w-[420px]">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={objective.status} />
            <ConfidenceBadge confidence={objective.confidence} />
            <ApprovalStateBadge approvalState={objective.approvalState} />
            <VisibilityBadge visibility={objective.visibility} />
          </div>
          <ProgressBar value={objective.score} label="Score" />
        </div>
      </div>
    </button>
  );
}

function keyResultsForObjective(objectiveId: string, allKeyResults: KeyResult[]) {
  return allKeyResults.filter((keyResult) => keyResult.objectiveId === objectiveId);
}
