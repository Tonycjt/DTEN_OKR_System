"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlignmentBadge } from "@/components/ui/alignment-badge";
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
import { createEmptyLocalOkrStore, loadLocalOkrStore } from "@/lib/local-okr-store";
import { mergeById } from "@/lib/merge-by-id";
import { useMockSessionUser } from "@/lib/mock-session";
import { canViewObjective } from "@/lib/permission-helpers";
import { departments, keyResults, objectives, quarters, teams, users } from "@/mock-data";
import type { Confidence, KeyResult, Objective, ObjectiveLevel, ObjectiveStatus, Visibility } from "@/types";

const allValue = "All";
const levelOptions: ObjectiveLevel[] = ["company", "department", "team", "individual"];
const statusOptions: ObjectiveStatus[] = ["Draft", "Active", "At Risk", "Off Track", "Completed", "On Hold", "Archived"];
const confidenceOptions: Confidence[] = ["High", "Medium", "Low"];
const visibilityOptions: Visibility[] = ["Company-wide", "Leadership-only", "Team-only", "Manager visibility", "Private to owner + manager"];
const alignmentOptions = ["Linked", "Unlinked"] as const;

export function OkrExploreView() {
  const activeUser = useMockSessionUser();
  const [store, setStore] = useState(() => createEmptyLocalOkrStore());
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string | null>(null);
  const [quarterId, setQuarterId] = useState(quarters.find((quarter) => quarter.isActive)?.id ?? quarters[0].id);
  const [level, setLevel] = useState<ObjectiveLevel | typeof allValue>(allValue);
  const [ownerId, setOwnerId] = useState(allValue);
  const [departmentId, setDepartmentId] = useState(allValue);
  const [teamId, setTeamId] = useState(allValue);
  const [status, setStatus] = useState<ObjectiveStatus | typeof allValue>(allValue);
  const [confidence, setConfidence] = useState<Confidence | typeof allValue>(allValue);
  const [visibility, setVisibility] = useState<Visibility | typeof allValue>(allValue);
  const [alignment, setAlignment] = useState<(typeof alignmentOptions)[number] | typeof allValue>(allValue);

  useEffect(() => {
    const refreshStore = () => setStore(loadLocalOkrStore());
    refreshStore();
    window.addEventListener("dten-local-okrs-updated", refreshStore);

    return () => window.removeEventListener("dten-local-okrs-updated", refreshStore);
  }, []);

  const mergedObjectives = useMemo(() => mergeById(objectives, store.objectives), [store.objectives]);
  const mergedKeyResults = useMemo(() => mergeById(keyResults, store.keyResults), [store.keyResults]);
  const visibleObjectives = useMemo(() => {
    return mergedObjectives.filter((objective) =>
      canViewObjective(activeUser, objective, {
        users,
        objectives: mergedObjectives,
        keyResults: mergedKeyResults,
      }),
    );
  }, [activeUser, mergedKeyResults, mergedObjectives]);
  const filteredObjectives = useMemo(() => {
    return visibleObjectives
      .filter((objective) => objective.quarterId === quarterId)
      .filter((objective) => level === allValue || objective.level === level)
      .filter((objective) => ownerId === allValue || objective.ownerUserId === ownerId)
      .filter((objective) => departmentId === allValue || objective.departmentId === departmentId)
      .filter((objective) => teamId === allValue || objective.teamId === teamId)
      .filter((objective) => status === allValue || objective.status === status)
      .filter((objective) => confidence === allValue || objective.confidence === confidence)
      .filter((objective) => visibility === allValue || objective.visibility === visibility)
      .filter((objective) => alignment === allValue || (alignment === "Linked" ? Boolean(objective.parentObjectiveId) : !objective.parentObjectiveId))
      .sort(sortByHierarchyThenUpdated);
  }, [alignment, confidence, departmentId, level, ownerId, quarterId, status, teamId, visibility, visibleObjectives]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="All OKRs"
        description={`Explore visible company, department, team, and individual OKRs for ${activeUser.name}.`}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-ink-950">OKR Explore</h2>
              <p className="mt-1 text-sm text-ink-600">Browse the hierarchy without creating tasks or changing ownership.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="info">Company</Badge>
              <Badge tone="neutral">Department</Badge>
              <Badge tone="neutral">Team</Badge>
              <Badge tone="neutral">Individual</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FilterSelect label="Quarter" value={quarterId} onChange={setQuarterId}>
            {quarters.map((quarter) => (
              <option key={quarter.id} value={quarter.id}>
                {quarter.label}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Level" value={level} onChange={(value) => setLevel(value as ObjectiveLevel | typeof allValue)}>
            <option>{allValue}</option>
            {levelOptions.map((item) => (
              <option key={item} value={item}>
                {formatLevel(item)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Owner" value={ownerId} onChange={setOwnerId}>
            <option>{allValue}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Department" value={departmentId} onChange={setDepartmentId}>
            <option>{allValue}</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Team" value={teamId} onChange={setTeamId}>
            <option>{allValue}</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Status" value={status} onChange={(value) => setStatus(value as ObjectiveStatus | typeof allValue)}>
            <option>{allValue}</option>
            {statusOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </FilterSelect>
          <FilterSelect label="Confidence" value={confidence} onChange={(value) => setConfidence(value as Confidence | typeof allValue)}>
            <option>{allValue}</option>
            {confidenceOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </FilterSelect>
          <FilterSelect label="Visibility" value={visibility} onChange={(value) => setVisibility(value as Visibility | typeof allValue)}>
            <option>{allValue}</option>
            {visibilityOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </FilterSelect>
          <FilterSelect label="Alignment" value={alignment} onChange={(value) => setAlignment(value as (typeof alignmentOptions)[number] | typeof allValue)}>
            <option>{allValue}</option>
            {alignmentOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </FilterSelect>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink-950">Visible OKRs</h2>
              <p className="mt-1 text-sm text-ink-600">Rows open the existing OKR detail view with full Key Results.</p>
            </div>
            <Badge tone="neutral">{filteredObjectives.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {filteredObjectives.length === 0 ? (
            <EmptyState title="No OKRs found" description="No visible OKRs match the current filters." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-left text-sm">
                <thead className="text-xs font-semibold uppercase tracking-wide text-ink-600">
                  <tr>
                    <th className="py-2 pr-4">Objective</th>
                    <th className="py-2 pr-4">Owner</th>
                    <th className="py-2 pr-4">Level</th>
                    <th className="py-2 pr-4">Department / Team</th>
                    <th className="py-2 pr-4">Quarter</th>
                    <th className="py-2 pr-4">Score</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Confidence</th>
                    <th className="py-2 pr-4">Visibility</th>
                    <th className="py-2 pr-4">Alignment</th>
                    <th className="py-2 pr-4">Last updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredObjectives.map((objective) => (
                    <ObjectiveRow
                      key={objective.id}
                      objective={objective}
                      keyResults={mergedKeyResults.filter((keyResult) => keyResult.objectiveId === objective.id)}
                      visibleObjectives={visibleObjectives}
                      onOpen={() => setSelectedObjectiveId(objective.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <OkrDetailDrawer objectiveId={selectedObjectiveId} onClose={() => setSelectedObjectiveId(null)} />
    </div>
  );
}

function ObjectiveRow({
  objective,
  keyResults: objectiveKeyResults,
  visibleObjectives,
  onOpen,
}: {
  objective: Objective;
  keyResults: KeyResult[];
  visibleObjectives: Objective[];
  onOpen: () => void;
}) {
  const owner = users.find((user) => user.id === objective.ownerUserId);
  const department = departments.find((item) => item.id === objective.departmentId);
  const team = teams.find((item) => item.id === objective.teamId);
  const quarter = quarters.find((item) => item.id === objective.quarterId);
  const parentObjective = objective.parentObjectiveId ? visibleObjectives.find((item) => item.id === objective.parentObjectiveId) : undefined;

  return (
    <tr
      className="cursor-pointer align-top transition hover:bg-blue-50/40"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      role="link"
      tabIndex={0}
    >
      <td className="py-4 pr-4">
        <div className="max-w-md space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">Objective</Badge>
            <p className="font-semibold leading-6 text-ink-950">{objective.title}</p>
            <Badge tone="neutral">{objectiveKeyResults.length} KR{objectiveKeyResults.length === 1 ? "" : "s"}</Badge>
          </div>
          <ProgressBar value={objective.score} label="Objective score" />
          {objectiveKeyResults.length > 0 ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Key Results preview</p>
              <div className="mt-2 space-y-2">
                {objectiveKeyResults.slice(0, 2).map((keyResult) => (
                  <div key={keyResult.id} className="rounded-md border border-slate-200 bg-white p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-800">{keyResult.title}</p>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
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
      </td>
      <td className="py-4 pr-4 text-ink-700">{owner?.name ?? "Unknown owner"}</td>
      <td className="py-4 pr-4">
        <Badge tone={levelTone(objective.level)}>{formatLevel(objective.level)}</Badge>
      </td>
      <td className="py-4 pr-4 text-ink-700">
        <div className="max-w-[220px]">
          <p className="font-semibold text-ink-950">{department?.name ?? "No department"}</p>
          <p className="mt-1 text-sm text-ink-600">{team?.name ?? "No team"}</p>
        </div>
      </td>
      <td className="py-4 pr-4 text-ink-700">{quarter?.label ?? objective.quarterId}</td>
      <td className="py-4 pr-4">
        <div className="w-36">
          <ProgressBar value={objective.score} label="Score" />
        </div>
      </td>
      <td className="py-4 pr-4">
        <StatusBadge status={objective.status} />
      </td>
      <td className="py-4 pr-4">
        <ConfidenceBadge confidence={objective.confidence} />
      </td>
      <td className="py-4 pr-4">
        <VisibilityBadge visibility={objective.visibility} />
      </td>
      <td className="py-4 pr-4">
        <div className="max-w-[220px] space-y-2">
          <AlignmentBadge linked={Boolean(objective.parentObjectiveId)} />
          {parentObjective ? (
            <p className="line-clamp-2 text-xs font-semibold leading-5 text-ink-700">Parent: {parentObjective.title}</p>
          ) : objective.parentObjectiveId ? (
            <p className="text-xs font-semibold leading-5 text-ink-600">Parent restricted</p>
          ) : null}
        </div>
      </td>
      <td className="py-4 pr-4 text-ink-700">{formatDate(objective.updatedAt)}</td>
    </tr>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
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

function sortByHierarchyThenUpdated(a: Objective, b: Objective) {
  const levelDifference = levelWeight(a.level) - levelWeight(b.level);
  if (levelDifference !== 0) return levelDifference;
  return b.updatedAt.localeCompare(a.updatedAt);
}

function levelWeight(level: ObjectiveLevel) {
  return levelOptions.indexOf(level);
}

function formatLevel(level: ObjectiveLevel) {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function levelTone(level: ObjectiveLevel) {
  if (level === "company") return "info";
  if (level === "individual") return "neutral";
  return "success";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
