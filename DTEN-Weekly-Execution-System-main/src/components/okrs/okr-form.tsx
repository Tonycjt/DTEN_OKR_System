"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import { AlignmentBadge } from "@/components/ui/alignment-badge";
import { ApprovalStateBadge } from "@/components/ui/approval-state-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  addLocalApproval,
  addLocalAuditLog,
  addLocalOkrChangeRequest,
  addLocalNotification,
  createEmptyLocalOkrStore,
  loadLocalOkrStore,
  replaceLocalKeyResults,
  saveLocalOkrStore,
  upsertLocalObjective,
} from "@/lib/local-okr-store";
import { mergeById } from "@/lib/merge-by-id";
import { departments, keyResults, objectives, quarters, teams, users } from "@/mock-data";
import { useMockSessionUser } from "@/lib/mock-session";
import {
  applyRollupAutomation,
  calculateObjectiveScoreFromKeyResults,
  getEffectiveKeyResult,
  getEffectiveKeyResults,
  isObjectiveEligibleForRollup,
} from "@/lib/okr-rollups";
import { canCreateRollupLink, canEditObjective, canViewObjective } from "@/lib/permission-helpers";
import { canUserRequestOkrChange, isMaterialOkrChange } from "@/lib/okr-change-request-helpers";
import { isValidTrackerUrl } from "@/lib/tracker-link-helpers";
import type {
  Approval,
  AuditLog,
  Confidence,
  KeyResult,
  KeyResultMetricType,
  KeyResultStatus,
  MonthlyTarget,
  Notification,
  Objective,
  ObjectiveLevel,
  OkrChangeRequest,
  OkrMaterialChangeType,
  TrackerLink,
  TrackerLinkType,
  Visibility,
} from "@/types";

type OkrFormProps = {
  objectiveId?: string;
};

type KrDraft = {
  id: string;
  title: string;
  description: string;
  metricType: KeyResultMetricType;
  startValue: string;
  targetValue: string;
  currentValue: string;
  progressPercent: string;
  status: KeyResultStatus;
  ownerUserId: string;
  dueDate: string;
  linkedChildObjectiveId: string;
  monthlyTargets: MonthlyTargetDraft[];
  trackerLinks: TrackerLink[];
};

type MonthlyTargetDraft = {
  monthLabel: string;
  targetValue: string;
  targetProgressPercent: string;
};

type FormErrors = {
  objective?: string[];
  keyResults?: Record<string, string[]>;
};

const objectiveLevels: ObjectiveLevel[] = ["company", "department", "team", "individual"];
const visibilityOptions: Visibility[] = ["Company-wide", "Leadership-only", "Team-only", "Manager visibility", "Private to owner + manager"];
const metricTypes: KeyResultMetricType[] = ["Percentage", "Numeric increase", "Numeric decrease", "Milestone/manual"];
const krStatuses: KeyResultStatus[] = ["Not Started", "On Track", "At Risk", "Off Track", "Completed"];
const trackerLinkTypes: TrackerLinkType[] = ["google_doc", "google_sheet", "crm_report", "dashboard", "other"];

export function OkrForm({ objectiveId }: OkrFormProps) {
  const router = useRouter();
  const currentUser = useMockSessionUser();
  const [localStore, setLocalStore] = useState(() => createEmptyLocalOkrStore());
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const existingObjective = useMemo(() => {
    return objectiveId ? localStore.objectives.find((item) => item.id === objectiveId) ?? objectives.find((item) => item.id === objectiveId) : undefined;
  }, [localStore.objectives, objectiveId]);

  const existingKeyResults = useMemo(() => {
    if (!existingObjective) {
      return [];
    }

    return mergeById(keyResults, localStore.keyResults).filter((item) => item.objectiveId === existingObjective.id);
  }, [existingObjective, localStore.keyResults]);

  const [quarterId, setQuarterId] = useState(existingObjective?.quarterId ?? quarters.find((quarter) => quarter.isActive)?.id ?? quarters[0].id);
  const [level, setLevel] = useState<ObjectiveLevel>(existingObjective?.level ?? "individual");
  const [ownerUserId, setOwnerUserId] = useState(existingObjective?.ownerUserId ?? currentUser.id);
  const [departmentId, setDepartmentId] = useState(existingObjective?.departmentId ?? currentUser.departmentId);
  const [teamId, setTeamId] = useState(existingObjective?.teamId ?? currentUser.teamId);
  const [title, setTitle] = useState(existingObjective?.title ?? "");
  const [description, setDescription] = useState(existingObjective?.description ?? "");
  const [visibility, setVisibility] = useState<Visibility>(existingObjective?.visibility ?? "Manager visibility");
  const [parentObjectiveId, setParentObjectiveId] = useState(existingObjective?.parentObjectiveId ?? "");
  const [changeReason, setChangeReason] = useState("");
  const [krDrafts, setKrDrafts] = useState<KrDraft[]>(() =>
    existingKeyResults.length > 0 ? existingKeyResults.map(toKrDraft) : [createBlankKrDraft(currentUser.id)],
  );

  useEffect(() => {
    const store = loadLocalOkrStore();
    setLocalStore(store);
  }, []);

  useEffect(() => {
    if (existingObjective) {
      return;
    }

    setOwnerUserId(currentUser.id);
    setDepartmentId(currentUser.departmentId);
    setTeamId(currentUser.teamId);
    setKrDrafts((drafts) => drafts.map((draft) => ({ ...draft, ownerUserId: currentUser.id })));
  }, [currentUser.departmentId, currentUser.id, currentUser.teamId, existingObjective]);

  const visibleTeams = teams.filter((team) => team.departmentId === departmentId);
  const mergedObjectives = mergeById(objectives, localStore.objectives);
  const mergedKeyResults = mergeById(keyResults, localStore.keyResults);
  const workingObjectiveId = existingObjective?.id ?? "draft-parent-objective";
  const formObjectiveForPermissions: Objective = existingObjective ?? {
    id: workingObjectiveId,
    title: title.trim() || "Draft objective",
    description: description.trim(),
    ownerUserId,
    level,
    departmentId,
    teamId,
    quarterId,
    visibility,
    status: "Draft",
    confidence: "Medium",
    score: calculateAverageProgress(),
    approvalState: "Draft",
    parentObjectiveId: parentObjectiveId || null,
    createdByUserId: currentUser.id,
    updatedByUserId: currentUser.id,
    activeFrom: null,
    activeTo: null,
    isActive: false,
    archived: false,
    createdAt: "",
    updatedAt: "",
  };
  const possibleParentObjectives = mergedObjectives
    .filter((objective) => objective.quarterId === quarterId && objective.id !== objectiveId && objective.level !== "individual");

  const permissionContext = {
    users,
    objectives: existingObjective ? mergedObjectives : [formObjectiveForPermissions, ...mergedObjectives],
    keyResults: mergedKeyResults,
  };
  const isApprovedObjective = existingObjective?.approvalState === "Approved";
  const isProposeChangeMode = Boolean(existingObjective && isApprovedObjective);
  const canOpenExistingObjective =
    !existingObjective ||
    canEditObjective(currentUser, existingObjective, permissionContext) ||
    canUserRequestOkrChange(currentUser, existingObjective);

  if (existingObjective && !canOpenExistingObjective) {
    return (
      <div className="space-y-6">
        <PageHeader title="Edit OKR" description="The selected mock user cannot edit this objective." />
      </div>
    );
  }

  function addKeyResult() {
    if (krDrafts.length >= 5) {
      setMessage("Each objective can have a maximum of 5 key results.");
      return;
    }

    setKrDrafts([...krDrafts, createBlankKrDraft(ownerUserId)]);
  }

  function removeKeyResult(id: string) {
    if (krDrafts.length === 1) {
      setMessage("At least one key result row is required on the form.");
      return;
    }

    setKrDrafts(krDrafts.filter((item) => item.id !== id));
  }

  function updateKr(id: string, updates: Partial<KrDraft>) {
    setKrDrafts(krDrafts.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }

  function updateMonthlyTarget(krId: string, index: number, updates: Partial<MonthlyTargetDraft>) {
    setKrDrafts(
      krDrafts.map((item) => {
        if (item.id !== krId) {
          return item;
        }

        return {
          ...item,
          monthlyTargets: item.monthlyTargets.map((target, targetIndex) => (targetIndex === index ? { ...target, ...updates } : target)),
        };
      }),
    );
  }

  function addTrackerLink(krId: string) {
    setKrDrafts(
      krDrafts.map((item) =>
        item.id === krId
          ? {
              ...item,
              trackerLinks: [
                ...item.trackerLinks,
                {
                  id: `draft-tracker-${crypto.randomUUID()}`,
                  title: "",
                  url: "",
                  type: "google_doc",
                  addedByUserId: currentUser.id,
                  addedAt: new Date().toISOString(),
                },
              ],
            }
          : item,
      ),
    );
  }

  function updateTrackerLink(krId: string, trackerLinkId: string, updates: Partial<TrackerLink>) {
    setKrDrafts(
      krDrafts.map((item) =>
        item.id === krId
          ? {
              ...item,
              trackerLinks: item.trackerLinks.map((trackerLink) => (trackerLink.id === trackerLinkId ? { ...trackerLink, ...updates } : trackerLink)),
            }
          : item,
      ),
    );
  }

  function removeTrackerLink(krId: string, trackerLinkId: string) {
    setKrDrafts(
      krDrafts.map((item) =>
        item.id === krId ? { ...item, trackerLinks: item.trackerLinks.filter((trackerLink) => trackerLink.id !== trackerLinkId) } : item,
      ),
    );
  }

  function handleSaveDraft() {
    persist("draft");
  }

  function handleSubmitForApproval() {
    persist("submit");
  }

  function persist(mode: "draft" | "submit") {
    setMessage(null);

    const validation = validateForm(mode);
    setErrors(validation.errors);

    if (!validation.valid) {
      setMessage("Please fix the highlighted validation issues before continuing.");
      return;
    }

    const owner = users.find((user) => user.id === ownerUserId);

    if (mode === "submit" && level === "individual" && !owner?.primaryManagerId) {
      setMessage("This individual OKR cannot be submitted because the owner does not have a primary manager.");
      return;
    }

    const timestamp = new Date().toISOString();
    const persistedObjectiveId = existingObjective?.id ?? `local-obj-${crypto.randomUUID()}`;
    const nextApprovalState = mode === "submit" && level === "individual" ? "Pending Approval" : mode === "draft" ? "Draft" : "Approved";
    const nextStatus = mode === "submit" && level !== "individual" ? "Active" : "Draft";
    const nextIsActive = mode === "submit" && level !== "individual";
    const objective: Objective = {
      id: persistedObjectiveId,
      title: title.trim(),
      description: description.trim(),
      ownerUserId,
      level,
      departmentId,
      teamId,
      quarterId,
      visibility,
      status: nextStatus,
      confidence: existingObjective?.confidence ?? ("Medium" satisfies Confidence),
      score: calculateAverageProgress(),
      approvalState: nextApprovalState,
      parentObjectiveId: parentObjectiveId || null,
      createdByUserId: existingObjective?.createdByUserId ?? currentUser.id,
      updatedByUserId: currentUser.id,
      activeFrom: nextIsActive ? timestamp.slice(0, 10) : existingObjective?.activeFrom ?? null,
      activeTo: existingObjective?.activeTo ?? null,
      isActive: nextIsActive,
      archived: false,
      createdAt: existingObjective?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    const nextKeyResults = krDrafts.map((draft) => toKeyResult(draft, persistedObjectiveId, mergedObjectives));

    if (isProposeChangeMode && existingObjective) {
      const requestedChanges = buildRequestedChanges(existingObjective, existingKeyResults, objective, nextKeyResults);
      const hasMaterialChanges = isMaterialOkrChange(requestedChanges);

      if (!hasMaterialChanges) {
        const trackerOnlyKeyResults = existingKeyResults.map((existingKeyResult) => {
          const draftKeyResult = nextKeyResults.find((keyResult) => keyResult.id === existingKeyResult.id);
          return draftKeyResult ? { ...existingKeyResult, trackerLinks: draftKeyResult.trackerLinks } : existingKeyResult;
        });
        let nextStore = replaceLocalKeyResults(loadLocalOkrStore(), persistedObjectiveId, trackerOnlyKeyResults);
        nextStore = addLocalAuditLog(nextStore, {
          id: `local-audit-${crypto.randomUUID()}`,
          actorUserId: currentUser.id,
          actionType: "okr_tracker_links_updated",
          targetType: "objective",
          targetId: persistedObjectiveId,
          metadata: { prototype: true, approvedOkrDirectMaterialEditBlocked: true },
          createdAt: timestamp,
        });
        saveLocalOkrStore(nextStore);
        setLocalStore(nextStore);
        setMessage("Tracker links saved. No material OKR change request was needed.");
        router.push(`/okrs/${persistedObjectiveId}`);
        return;
      }

      if (!changeReason.trim()) {
        setMessage("Please add a reason before proposing material changes to an approved OKR.");
        return;
      }

      if (!owner?.primaryManagerId) {
        setMessage("This approved OKR cannot receive a change request because the owner does not have a primary manager.");
        return;
      }

      const changeRequest: OkrChangeRequest = {
        id: `local-okr-change-${crypto.randomUUID()}`,
        objectiveId: persistedObjectiveId,
        requestedByUserId: currentUser.id,
        approverUserId: owner.primaryManagerId,
        status: "pending",
        requestedChanges,
        reason: changeReason.trim(),
        managerNote: null,
        createdAt: timestamp,
        decidedAt: null,
      };
      let nextStore = addLocalOkrChangeRequest(loadLocalOkrStore(), changeRequest);
      nextStore = addLocalNotification(nextStore, {
        id: `local-notification-${crypto.randomUUID()}`,
        userId: owner.primaryManagerId,
        type: "manager_attention_needed",
        resourceType: "objective",
        resourceId: persistedObjectiveId,
        channel: "in_app",
        sentAt: timestamp,
        readAt: null,
        status: "Sent",
      });
      nextStore = addLocalAuditLog(nextStore, {
        id: `local-audit-${crypto.randomUUID()}`,
        actorUserId: currentUser.id,
        actionType: "okr_change_request_created",
        targetType: "objective",
        targetId: persistedObjectiveId,
        metadata: { changeRequestId: changeRequest.id, prototype: true },
        createdAt: timestamp,
      });
      saveLocalOkrStore(nextStore);
      setLocalStore(nextStore);
      setMessage("Change request sent to the manager. The approved OKR was not changed.");
      router.push(`/okrs/${persistedObjectiveId}`);
      return;
    }

    let nextStore = upsertLocalObjective(loadLocalOkrStore(), objective);
    nextStore = replaceLocalKeyResults(nextStore, persistedObjectiveId, nextKeyResults);
    nextStore = applyRollupAutomation(nextStore);
    const auditLogs = buildOkrAuditLogs({
      actorUserId: currentUser.id,
      existingObjective,
      existingKeyResults,
      mode,
      objective,
      nextKeyResults,
      timestamp,
    });

    auditLogs.forEach((auditLog) => {
      nextStore = addLocalAuditLog(nextStore, auditLog);
    });

    if (nextKeyResults.some((keyResult) => keyResult.linkedChildObjectiveId) && objective.ownerUserId !== currentUser.id) {
      const notification: Notification = {
        id: `local-notification-${crypto.randomUUID()}`,
        userId: objective.ownerUserId,
        type: "rollup_state_changed",
        resourceType: "objective",
        resourceId: persistedObjectiveId,
        channel: "in_app",
        sentAt: timestamp,
        readAt: null,
        status: "Sent",
      };
      nextStore = addLocalNotification(nextStore, notification);
    }

    if (mode === "submit" && level === "individual" && owner?.primaryManagerId) {
      const approval: Approval = {
        id: `local-approval-${crypto.randomUUID()}`,
        objectiveId: persistedObjectiveId,
        approverUserId: owner.primaryManagerId,
        approvalStatus: "Pending",
        approvalNote: null,
        approvalTimestamp: null,
        createdAt: timestamp,
      };
      nextStore = addLocalApproval(nextStore, approval);
    }

    saveLocalOkrStore(nextStore);
    setLocalStore(nextStore);
    setMessage(mode === "draft" ? "Draft saved locally." : "OKR submitted locally.");
    router.push(`/okrs/${persistedObjectiveId}`);
  }

  function validateForm(mode: "draft" | "submit") {
    const nextErrors: FormErrors = {
      objective: [],
      keyResults: {},
    };

    if (!title.trim()) nextErrors.objective?.push("Objective title is required.");
    if (!ownerUserId) nextErrors.objective?.push("Owner is required.");
    if (!quarterId) nextErrors.objective?.push("Quarter is required.");
    if (!level) nextErrors.objective?.push("Level is required.");
    if (!visibility) nextErrors.objective?.push("Visibility is required.");
    if (mode === "submit" && krDrafts.length < 1) nextErrors.objective?.push("At least one KR is required before submitting for approval.");
    if (krDrafts.length > 5) nextErrors.objective?.push("Maximum 5 KRs allowed.");

    krDrafts.forEach((draft) => {
      const krErrors: string[] = [];
      const progress = Number(draft.progressPercent);
      if (!draft.title.trim()) krErrors.push("KR title is required.");
      if ((draft.metricType === "Numeric increase" || draft.metricType === "Numeric decrease") && (!draft.startValue || !draft.targetValue)) {
        krErrors.push("Numeric KRs require start and target values.");
      }
      if (!draft.linkedChildObjectiveId && (Number.isNaN(progress) || progress < 0 || progress > 100)) krErrors.push("Progress must stay between 0 and 100.");
      const monthlyTargetValidation = validateMonthlyTargets(draft);
      if (mode === "submit") {
        krErrors.push(...monthlyTargetValidation.requiredMessages);
      }
      krErrors.push(...monthlyTargetValidation.invalidMessages);
      draft.trackerLinks.forEach((trackerLink, index) => {
        const hasTrackerLink = Boolean(trackerLink.title.trim() || trackerLink.url.trim());
        if (!hasTrackerLink) {
          return;
        }

        if (!trackerLink.title.trim()) {
          krErrors.push(`Tracker link ${index + 1} title is required when a tracker URL is entered.`);
        }

        if (!trackerLink.url.trim()) {
          krErrors.push(`Tracker link ${index + 1} URL is required when a tracker title is entered.`);
        } else if (!isValidTrackerUrl(trackerLink.url)) {
          krErrors.push(`Tracker link ${index + 1} must use a valid http or https URL.`);
        }
      });
      if (draft.linkedChildObjectiveId) {
        const childObjective = mergedObjectives.find((objective) => objective.id === draft.linkedChildObjectiveId);
        const draftKeyResult = toKeyResult(draft, workingObjectiveId, mergedObjectives);
        const duplicateLink = mergedKeyResults.some(
          (keyResult) => keyResult.id !== draft.id && keyResult.linkedChildObjectiveId === draft.linkedChildObjectiveId,
        );
        const duplicateDraftLink = krDrafts.some((item) => item.id !== draft.id && item.linkedChildObjectiveId === draft.linkedChildObjectiveId);

        if (!childObjective) {
          krErrors.push("Linked child objective was not found.");
        } else if (!canCreateRollupLink(currentUser, draftKeyResult, childObjective, permissionContext)) {
          krErrors.push("Roll-up links require visibility of both records and an approved active child objective.");
        }

        if (duplicateLink || duplicateDraftLink) {
          krErrors.push("A child objective can contribute to only one parent KR.");
        }
      }
      if (krErrors.length > 0) nextErrors.keyResults![draft.id] = krErrors;
    });

    return {
      valid: (nextErrors.objective?.length ?? 0) === 0 && Object.keys(nextErrors.keyResults ?? {}).length === 0,
      errors: nextErrors,
    };
  }

  function calculateAverageProgress() {
    const previewObjectiveId = existingObjective?.id ?? "preview-objective";
    const previewKeyResults = krDrafts.map((draft) => toKeyResult(draft, previewObjectiveId, mergedObjectives));
    const effectivePreviewKeyResults = getEffectiveKeyResults(previewKeyResults, mergedObjectives);
    return calculateObjectiveScoreFromKeyResults(previewObjectiveId, effectivePreviewKeyResults);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isProposeChangeMode ? "Propose OKR Change" : existingObjective ? "Edit OKR" : "Create OKR"}
        description={
          isProposeChangeMode
            ? "Approved OKRs cannot be materially changed directly. Propose the change and the manager can review it."
            : "One structured form for objective fields and 1 to 5 key results. Data is saved locally for the prototype."
        }
      />

      {message ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-dten-amber">
          <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
          <span>{message}</span>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-ink-950">Objective</h2>
          <p className="mt-1 text-sm text-ink-600">Keep the objective focused on outcomes, alignment, and visibility.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <ValidationList messages={errors.objective ?? []} />
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField label="Quarter" value={quarterId} onChange={setQuarterId}>
              {quarters.map((quarter) => (
                <option key={quarter.id} value={quarter.id}>
                  {quarter.label}
                </option>
              ))}
            </SelectField>
            <SelectField label="Level" value={level} onChange={(value) => setLevel(value as ObjectiveLevel)}>
              {objectiveLevels.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectField>
            <SelectField label="Owner" value={ownerUserId} onChange={setOwnerUserId}>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Visibility" value={visibility} onChange={(value) => setVisibility(value as Visibility)}>
              {visibilityOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </SelectField>
            <SelectField label="Department" value={departmentId ?? ""} onChange={setDepartmentId}>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Team" value={teamId ?? ""} onChange={setTeamId}>
              {visibleTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </SelectField>
          </div>

          <TextField label="Title" value={title} onChange={setTitle} placeholder="Example: Improve weekly execution clarity" />
          <TextAreaField
            label="Description"
            value={description}
            onChange={setDescription}
            placeholder="Describe the outcome and why it matters this quarter."
          />

          <SelectField label="Optional alignment parent objective" value={parentObjectiveId} onChange={setParentObjectiveId}>
            <option value="">No parent objective</option>
            {possibleParentObjectives.map((objective) => (
              <option key={objective.id} value={objective.id}>
                {objective.title}
              </option>
            ))}
          </SelectField>

          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">Score preview: {calculateAverageProgress()}%</Badge>
            <ApprovalStateBadge approvalState={level === "individual" ? "Pending Approval" : "Approved"} />
            <AlignmentBadge linked={Boolean(parentObjectiveId)} />
          </div>
        </CardContent>
      </Card>

      {isProposeChangeMode ? (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-ink-950">Change request reason</h2>
            <p className="mt-1 text-sm text-ink-600">
              Material changes to approved OKRs stay pending until the manager reviews them. Tracker links can still be updated directly.
            </p>
          </CardHeader>
          <CardContent>
            <TextAreaField
              label="Reason for change"
              value={changeReason}
              onChange={setChangeReason}
              placeholder="Explain what changed and why this OKR needs an update."
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-ink-950">Key Results</h2>
              <p className="mt-1 text-sm text-ink-600">Add 1 to 5 measurable results. These remain OKR metrics, not tasks.</p>
            </div>
            <button
              type="button"
              onClick={addKeyResult}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-ink-800 transition hover:bg-slate-50"
            >
              <Plus size={16} aria-hidden="true" />
              Add KR
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {krDrafts.map((draft, index) => (
            <div key={draft.id} className="rounded-lg border border-slate-200 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink-950">Key Result {index + 1}</h3>
                <button
                  type="button"
                  onClick={() => removeKeyResult(draft.id)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-ink-600 hover:bg-slate-50"
                  aria-label={`Remove key result ${index + 1}`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
              <ValidationList messages={errors.keyResults?.[draft.id] ?? []} />
              <WarningList messages={validateMonthlyTargets(draft).allWarningMessages} />
              {draft.linkedChildObjectiveId ? <LinkedKrNotice draft={draft} objectives={mergedObjectives} users={users} /> : null}
              <div className="grid gap-4 md:grid-cols-2">
                <TextField label="KR title" value={draft.title} onChange={(value) => updateKr(draft.id, { title: value })} />
                <SelectField label="Owner" value={draft.ownerUserId} onChange={(value) => updateKr(draft.id, { ownerUserId: value })}>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Metric type"
                  value={draft.metricType}
                  onChange={(value) => updateKr(draft.id, { metricType: value as KeyResultMetricType })}
                >
                  {metricTypes.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </SelectField>
                <SelectField
                  label="Contribution linked child objective"
                  value={draft.linkedChildObjectiveId}
                  onChange={(value) => {
                    const childObjective = mergedObjectives.find((objective) => objective.id === value);
                    const nextUpdates: Partial<KrDraft> = { linkedChildObjectiveId: value };

                    if (childObjective && isObjectiveEligibleForRollup(childObjective)) {
                      nextUpdates.progressPercent = String(childObjective.score);
                      nextUpdates.currentValue = String(childObjective.score);
                    }

                    updateKr(draft.id, nextUpdates);
                  }}
                >
                  <option value="">Manual progress</option>
                  {getLinkableChildObjectives({
                    currentUser,
                    draft,
                    existingObjectiveId: existingObjective?.id,
                    parentObjectiveId: workingObjectiveId,
                    mergedKeyResults,
                    mergedObjectives,
                    permissionContext,
                    quarterId,
                  }).map((objective) => (
                    <option key={objective.id} value={objective.id}>
                      {objective.title}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Status"
                  value={draft.status}
                  onChange={(value) => updateKr(draft.id, { status: value as KeyResultStatus })}
                  disabled={isLinkedActive(draft, mergedObjectives)}
                >
                  {krStatuses.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </SelectField>
                <TextField label="Start value" value={draft.startValue} onChange={(value) => updateKr(draft.id, { startValue: value })} type="number" />
                <TextField label="Target value" value={draft.targetValue} onChange={(value) => updateKr(draft.id, { targetValue: value })} type="number" />
                <TextField
                  label="Current value"
                  value={draft.currentValue}
                  onChange={(value) => updateKr(draft.id, { currentValue: value })}
                  type="number"
                  disabled={isLinkedActive(draft, mergedObjectives)}
                />
                <TextField
                  label="Progress percent"
                  value={draft.progressPercent}
                  onChange={(value) => updateKr(draft.id, { progressPercent: clampProgressInput(value) })}
                  type="number"
                  disabled={isLinkedActive(draft, mergedObjectives)}
                />
                <TextField label="Timing date (optional)" value={draft.dueDate} onChange={(value) => updateKr(draft.id, { dueDate: value })} type="date" />
              </div>
              <TextAreaField
                label="KR description"
                value={draft.description}
                onChange={(value) => updateKr(draft.id, { description: value })}
                placeholder="Describe the metric or milestone."
              />
              <details className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-ink-950">Monthly Targets</summary>
                <p className="mt-2 text-sm leading-6 text-ink-600">
                  Monthly targets help you and your manager see whether this KR is on pace before quarter end.
                </p>
                <div className="mt-4 grid gap-4">
                  {draft.monthlyTargets.map((target, monthIndex) => (
                    <div key={`${draft.id}-monthly-target-${monthIndex}`} className="rounded-md border border-slate-200 bg-white p-3">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-600">Month {monthIndex + 1}</p>
                      <div className="grid gap-3 md:grid-cols-3">
                        <TextField
                          label={`Month ${monthIndex + 1} label`}
                          value={target.monthLabel}
                          onChange={(value) => updateMonthlyTarget(draft.id, monthIndex, { monthLabel: value })}
                          placeholder={monthIndex === 0 ? "April" : monthIndex === 1 ? "May" : "June"}
                        />
                        <TextField
                          label={`Month ${monthIndex + 1} target value`}
                          value={target.targetValue}
                          onChange={(value) => updateMonthlyTarget(draft.id, monthIndex, { targetValue: value })}
                          type="number"
                        />
                        <TextField
                          label={`Month ${monthIndex + 1} target progress %`}
                          value={target.targetProgressPercent}
                          onChange={(value) => updateMonthlyTarget(draft.id, monthIndex, { targetProgressPercent: clampProgressInput(value) })}
                          type="number"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-600">
                  Numeric increase targets should generally rise over the quarter; numeric decrease targets should generally fall.
                </p>
              </details>
              <details className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-ink-950">Tracker Links</summary>
                <p className="mt-2 text-sm leading-6 text-ink-600">
                  Add supporting evidence or context links for this KR. Tracker links do not change score, status, confidence, or approval state.
                </p>
                <div className="mt-4 space-y-3">
                  {draft.trackerLinks.length === 0 ? (
                    <p className="text-sm text-ink-600">No tracker links added.</p>
                  ) : (
                    draft.trackerLinks.map((trackerLink, trackerIndex) => (
                      <div key={trackerLink.id} className="rounded-md border border-slate-200 bg-white p-3">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Tracker link {trackerIndex + 1}</p>
                          <button
                            type="button"
                            onClick={() => removeTrackerLink(draft.id, trackerLink.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-ink-600 hover:bg-slate-50"
                            aria-label={`Remove tracker link ${trackerIndex + 1}`}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                          <TextField
                            label="Link title"
                            value={trackerLink.title}
                            onChange={(value) => updateTrackerLink(draft.id, trackerLink.id, { title: value })}
                            placeholder="Progress dashboard"
                          />
                          <SelectField
                            label="Type"
                            value={trackerLink.type}
                            onChange={(value) => updateTrackerLink(draft.id, trackerLink.id, { type: value as TrackerLinkType })}
                          >
                            {trackerLinkTypes.map((trackerLinkType) => (
                              <option key={trackerLinkType} value={trackerLinkType}>
                                {formatTrackerType(trackerLinkType)}
                              </option>
                            ))}
                          </SelectField>
                          <TextField
                            label="URL"
                            value={trackerLink.url}
                            onChange={(value) => updateTrackerLink(draft.id, trackerLink.id, { url: value })}
                            placeholder="https://..."
                          />
                        </div>
                      </div>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={() => addTrackerLink(draft.id)}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-ink-800 transition hover:bg-slate-50"
                  >
                    <Plus size={14} aria-hidden="true" />
                    Add tracker link
                  </button>
                </div>
              </details>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
        {!isProposeChangeMode ? (
          <button
            type="button"
            onClick={handleSaveDraft}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-ink-800 transition hover:bg-slate-50"
          >
            Save Draft
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleSubmitForApproval}
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-dten-blue bg-dten-blue px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          {isProposeChangeMode ? "Submit Change Request" : "Submit for Approval"}
        </button>
      </div>
    </div>
  );
}

function createBlankKrDraft(ownerUserId: string): KrDraft {
  return {
    id: `draft-kr-${crypto.randomUUID()}`,
    title: "",
    description: "",
    metricType: "Percentage",
    startValue: "0",
    targetValue: "100",
    currentValue: "0",
    progressPercent: "0",
    status: "Not Started",
    ownerUserId,
    dueDate: "",
    linkedChildObjectiveId: "",
    monthlyTargets: createBlankMonthlyTargetDrafts(),
    trackerLinks: [],
  };
}

function toKrDraft(keyResult: KeyResult): KrDraft {
  return {
    id: keyResult.id,
    title: keyResult.title,
    description: keyResult.description,
    metricType: keyResult.metricType,
    startValue: keyResult.startValue?.toString() ?? "",
    targetValue: keyResult.targetValue?.toString() ?? "",
    currentValue: keyResult.currentValue?.toString() ?? "",
    progressPercent: keyResult.progressPercent.toString(),
    status: keyResult.status,
    ownerUserId: keyResult.ownerUserId,
    dueDate: keyResult.dueDate ?? "",
    linkedChildObjectiveId: keyResult.linkedChildObjectiveId ?? "",
    monthlyTargets: toMonthlyTargetDrafts(keyResult.monthlyTargets),
    trackerLinks: keyResult.trackerLinks ?? [],
  };
}

function toKeyResult(draft: KrDraft, objectiveId: string, mergedObjectives: Objective[]): KeyResult {
  const keyResult: KeyResult = {
    id: draft.id.startsWith("draft-kr-") ? `local-kr-${crypto.randomUUID()}` : draft.id,
    objectiveId,
    title: draft.title.trim(),
    description: draft.description.trim(),
    metricType: draft.metricType,
    startValue: draft.startValue ? Number(draft.startValue) : null,
    targetValue: draft.targetValue ? Number(draft.targetValue) : null,
    currentValue: draft.currentValue ? Number(draft.currentValue) : null,
    progressPercent: Math.max(0, Math.min(100, Number(draft.progressPercent) || 0)),
    status: draft.status,
    ownerUserId: draft.ownerUserId,
    dueDate: draft.dueDate || null,
    rollupMode: draft.linkedChildObjectiveId ? "Auto from linked child objective" : "Manual",
    linkedChildObjectiveId: draft.linkedChildObjectiveId || null,
    monthlyTargets: toMonthlyTargets(draft.monthlyTargets) ?? [],
    trackerLinks: toTrackerLinks(draft.trackerLinks, draft.ownerUserId),
  };

  return getEffectiveKeyResult(keyResult, mergedObjectives);
}

function buildRequestedChanges(
  existingObjective: Objective,
  existingKeyResults: KeyResult[],
  nextObjective: Objective,
  nextKeyResults: KeyResult[],
): OkrChangeRequest["requestedChanges"] {
  const materialChangeTypes: OkrMaterialChangeType[] = [];
  const requestedChanges: OkrChangeRequest["requestedChanges"] = {};
  const existingKeyResultsById = new Map(existingKeyResults.map((keyResult) => [keyResult.id, keyResult]));
  const nextKeyResultsById = new Map(nextKeyResults.map((keyResult) => [keyResult.id, keyResult]));

  if (existingObjective.title !== nextObjective.title) {
    requestedChanges.objectiveTitle = nextObjective.title;
    materialChangeTypes.push("objective_title");
  }

  if (existingObjective.ownerUserId !== nextObjective.ownerUserId) {
    requestedChanges.ownerUserId = nextObjective.ownerUserId;
    materialChangeTypes.push("owner");
  }

  if (existingObjective.visibility !== nextObjective.visibility) {
    requestedChanges.visibility = nextObjective.visibility;
    materialChangeTypes.push("visibility");
  }

  if ((existingObjective.parentObjectiveId ?? null) !== (nextObjective.parentObjectiveId ?? null)) {
    requestedChanges.parentObjectiveId = nextObjective.parentObjectiveId ?? null;
    materialChangeTypes.push("alignment_link");
  }

  const addedKeyResult = nextKeyResults.find((keyResult) => !existingKeyResultsById.has(keyResult.id));
  if (addedKeyResult) {
    requestedChanges.addKeyResult = addedKeyResult;
    materialChangeTypes.push("add_key_result");
  }

  const removedKeyResult = existingKeyResults.find((keyResult) => !nextKeyResultsById.has(keyResult.id));
  if (removedKeyResult) {
    requestedChanges.removeKeyResultId = removedKeyResult.id;
    materialChangeTypes.push("remove_key_result");
  }

  for (const nextKeyResult of nextKeyResults) {
    const existingKeyResult = existingKeyResultsById.get(nextKeyResult.id);
    if (!existingKeyResult) {
      continue;
    }

    if (existingKeyResult.title !== nextKeyResult.title) {
      requestedChanges.keyResultId = nextKeyResult.id;
      requestedChanges.keyResultTitle = nextKeyResult.title;
      materialChangeTypes.push("key_result_title");
      break;
    }
  }

  for (const nextKeyResult of nextKeyResults) {
    const existingKeyResult = existingKeyResultsById.get(nextKeyResult.id);
    if (!existingKeyResult) {
      continue;
    }

    if ((existingKeyResult.targetValue ?? null) !== (nextKeyResult.targetValue ?? null)) {
      requestedChanges.keyResultId = nextKeyResult.id;
      requestedChanges.keyResultTargetValue = nextKeyResult.targetValue ?? 0;
      materialChangeTypes.push("key_result_target");
      break;
    }
  }

  for (const nextKeyResult of nextKeyResults) {
    const existingKeyResult = existingKeyResultsById.get(nextKeyResult.id);
    if (!existingKeyResult) {
      continue;
    }

    if (JSON.stringify(existingKeyResult.monthlyTargets ?? []) !== JSON.stringify(nextKeyResult.monthlyTargets ?? [])) {
      requestedChanges.keyResultId = nextKeyResult.id;
      requestedChanges.monthlyTargets = nextKeyResult.monthlyTargets ?? [];
      materialChangeTypes.push("monthly_targets");
      break;
    }
  }

  for (const nextKeyResult of nextKeyResults) {
    const existingKeyResult = existingKeyResultsById.get(nextKeyResult.id);
    if (!existingKeyResult) {
      continue;
    }

    if ((existingKeyResult.linkedChildObjectiveId ?? null) !== (nextKeyResult.linkedChildObjectiveId ?? null)) {
      requestedChanges.keyResultId = nextKeyResult.id;
      requestedChanges.linkedChildObjectiveId = nextKeyResult.linkedChildObjectiveId ?? null;
      materialChangeTypes.push("rollup_link");
      break;
    }
  }

  requestedChanges.materialChangeTypes = Array.from(new Set(materialChangeTypes));
  return requestedChanges;
}

function createBlankMonthlyTargetDrafts(): MonthlyTargetDraft[] {
  return [
    { monthLabel: "April", targetValue: "", targetProgressPercent: "" },
    { monthLabel: "May", targetValue: "", targetProgressPercent: "" },
    { monthLabel: "June", targetValue: "", targetProgressPercent: "" },
  ];
}

function toMonthlyTargetDrafts(monthlyTargets?: MonthlyTarget[]): MonthlyTargetDraft[] {
  const blanks = createBlankMonthlyTargetDrafts();
  monthlyTargets?.slice(0, 3).forEach((target, index) => {
    blanks[index] = {
      monthLabel: target.monthLabel,
      targetValue: String(target.targetValue),
      targetProgressPercent: typeof target.targetProgressPercent === "number" ? String(target.targetProgressPercent) : "",
    };
  });

  return blanks;
}

function toMonthlyTargets(monthlyTargets: MonthlyTargetDraft[]): MonthlyTarget[] | undefined {
  const savedTargets = monthlyTargets
    .filter((target) => target.targetValue.trim() || target.targetProgressPercent.trim())
    .map((target) => ({
      monthLabel: target.monthLabel.trim(),
      targetValue: Number(target.targetValue),
      id: target.monthLabel.trim() ? `monthly-target-${target.monthLabel.trim().toLowerCase().replace(/\s+/g, "-")}` : `monthly-target-${crypto.randomUUID()}`,
      targetProgressPercent: target.targetProgressPercent.trim() ? Number(target.targetProgressPercent) : 0,
    }))
    .filter((target) => target.monthLabel && !Number.isNaN(target.targetValue));

  return savedTargets.length > 0 ? savedTargets : undefined;
}

function toTrackerLinks(trackerLinks: TrackerLink[], addedByUserId: string) {
  return trackerLinks
    .filter((trackerLink) => trackerLink.title.trim() && trackerLink.url.trim() && isValidTrackerUrl(trackerLink.url))
    .map((trackerLink) => ({
      ...trackerLink,
      id: trackerLink.id.startsWith("draft-tracker-") ? `local-tracker-${crypto.randomUUID()}` : trackerLink.id,
      title: trackerLink.title.trim(),
      url: trackerLink.url.trim(),
      addedByUserId: trackerLink.addedByUserId || addedByUserId,
      addedAt: trackerLink.addedAt || new Date().toISOString(),
    }));
}

function validateMonthlyTargets(draft: KrDraft) {
  const requiredMessages: string[] = [];
  const invalidMessages: string[] = [];
  const warningMessages: string[] = [];
  const monthlyTargets = draft.monthlyTargets.slice(0, 3);

  if (monthlyTargets.length !== 3) {
    requiredMessages.push("Missing monthly targets: each KR needs 3 monthly checkpoint rows before Submit for Approval.");
  }

  monthlyTargets.forEach((target, index) => {
    const monthNumber = index + 1;

    if (!target.monthLabel.trim()) {
      requiredMessages.push(`Month ${monthNumber} label is required before Submit for Approval.`);
    }

    if (!target.targetValue.trim()) {
      requiredMessages.push(`Month ${monthNumber} target value is required before Submit for Approval.`);
    } else if (Number.isNaN(Number(target.targetValue))) {
      invalidMessages.push(`Month ${monthNumber} target value must be numeric.`);
    }

    if (!target.targetProgressPercent.trim()) {
      requiredMessages.push(`Month ${monthNumber} target progress % is required before Submit for Approval.`);
    } else {
      const monthlyProgress = Number(target.targetProgressPercent);
      if (Number.isNaN(monthlyProgress) || monthlyProgress < 0 || monthlyProgress > 100) {
        invalidMessages.push(`Month ${monthNumber} target progress must stay between 0 and 100.`);
      }
    }
  });

  const completeTargetValues = monthlyTargets
    .map((target) => Number(target.targetValue))
    .filter((value) => !Number.isNaN(value));

  if (completeTargetValues.length === 3 && draft.metricType === "Numeric increase" && !isGenerallyIncreasing(completeTargetValues)) {
    warningMessages.push("Monthly target values should generally increase over the quarter for numeric increase KRs.");
  }

  if (completeTargetValues.length === 3 && draft.metricType === "Numeric decrease" && !isGenerallyDecreasing(completeTargetValues)) {
    warningMessages.push("Monthly target values should generally decrease over the quarter for numeric decrease KRs.");
  }

  return {
    requiredMessages,
    invalidMessages,
    warningMessages,
    allWarningMessages: [...requiredMessages, ...warningMessages],
  };
}

function isGenerallyIncreasing(values: number[]) {
  return values.every((value, index) => index === 0 || value >= values[index - 1]);
}

function isGenerallyDecreasing(values: number[]) {
  return values.every((value, index) => index === 0 || value <= values[index - 1]);
}

function formatTrackerType(type: TrackerLinkType) {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isLinkedActive(draft: KrDraft, mergedObjectives: Objective[]) {
  const childObjective = draft.linkedChildObjectiveId ? mergedObjectives.find((objective) => objective.id === draft.linkedChildObjectiveId) : undefined;
  return isObjectiveEligibleForRollup(childObjective);
}

function LinkedKrNotice({ draft, objectives: mergedObjectives, users: allUsers }: { draft: KrDraft; objectives: Objective[]; users: typeof users }) {
  const childObjective = mergedObjectives.find((objective) => objective.id === draft.linkedChildObjectiveId);
  const owner = childObjective ? allUsers.find((user) => user.id === childObjective.ownerUserId) : undefined;

  if (!childObjective) {
    return <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-dten-amber">Linked child objective not found.</div>;
  }

  if (!isObjectiveEligibleForRollup(childObjective)) {
    return (
      <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-dten-amber">
        Pending roll-up: the linked child objective must be approved and active before it can drive parent KR progress.
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-dten-blue">
      Auto-updated from linked objective. Progress source: linked objective owned by {owner?.name ?? "Unknown owner"}.
    </div>
  );
}

function getLinkableChildObjectives({
  currentUser,
  draft,
  existingObjectiveId,
  parentObjectiveId,
  mergedKeyResults,
  mergedObjectives,
  permissionContext,
  quarterId,
}: {
  currentUser: typeof users[number];
  draft: KrDraft;
  existingObjectiveId?: string;
  parentObjectiveId: string;
  mergedKeyResults: KeyResult[];
  mergedObjectives: Objective[];
  permissionContext: {
    users: typeof users;
    objectives: Objective[];
    keyResults: KeyResult[];
  };
  quarterId: string;
}) {
  const draftKeyResult = toKeyResult(draft, parentObjectiveId, mergedObjectives);

  return mergedObjectives.filter((objective) => {
    const alreadyLinkedToAnotherKr = mergedKeyResults.some(
      (keyResult) => keyResult.id !== draft.id && keyResult.linkedChildObjectiveId === objective.id,
    );
    const isSelected = draft.linkedChildObjectiveId === objective.id;

    return (
      objective.id !== existingObjectiveId &&
      objective.id !== parentObjectiveId &&
      objective.quarterId === quarterId &&
      canViewObjective(currentUser, objective, permissionContext) &&
      (isSelected || !alreadyLinkedToAnotherKr) &&
      (isSelected || canCreateRollupLink(currentUser, draftKeyResult, objective, permissionContext))
    );
  });
}

function buildOkrAuditLogs({
  actorUserId,
  existingObjective,
  existingKeyResults,
  mode,
  objective,
  nextKeyResults,
  timestamp,
}: {
  actorUserId: string;
  existingObjective?: Objective;
  existingKeyResults: KeyResult[];
  mode: "draft" | "submit";
  objective: Objective;
  nextKeyResults: KeyResult[];
  timestamp: string;
}) {
  const auditLogs: AuditLog[] = [];

  if (!existingObjective) {
    auditLogs.push(createAuditLog(actorUserId, "okr_created", "objective", objective.id, { level: objective.level }, timestamp));
  }

  if (mode === "submit" && objective.approvalState === "Pending Approval") {
    auditLogs.push(createAuditLog(actorUserId, "okr_submitted_for_approval", "objective", objective.id, { ownerUserId: objective.ownerUserId }, timestamp));
  }

  if (existingObjective && existingObjective.visibility !== objective.visibility) {
    auditLogs.push(
      createAuditLog(
        actorUserId,
        "visibility_changed",
        "objective",
        objective.id,
        { from: existingObjective.visibility, to: objective.visibility },
        timestamp,
      ),
    );
  }

  nextKeyResults.forEach((keyResult) => {
    const previousKeyResult = existingKeyResults.find((item) => item.id === keyResult.id);
    const previousLink = previousKeyResult?.linkedChildObjectiveId ?? null;
    const nextLink = keyResult.linkedChildObjectiveId ?? null;

    if (!previousLink && nextLink) {
      auditLogs.push(
        createAuditLog(actorUserId, "contribution_link_created", "key_result", keyResult.id, { linkedChildObjectiveId: nextLink }, timestamp),
      );
    }

    if (previousLink && !nextLink) {
      auditLogs.push(
        createAuditLog(actorUserId, "contribution_link_removed", "key_result", keyResult.id, { linkedChildObjectiveId: previousLink }, timestamp),
      );
    }
  });

  return auditLogs;
}

function createAuditLog(
  actorUserId: string,
  actionType: string,
  targetType: string,
  targetId: string,
  metadata: AuditLog["metadata"],
  createdAt: string,
): AuditLog {
  return {
    id: `local-audit-${crypto.randomUUID()}`,
    actorUserId,
    actionType,
    targetType,
    targetId,
    metadata,
    createdAt,
  };
}

function clampProgressInput(value: string) {
  if (value === "") {
    return value;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return String(Math.max(0, Math.min(100, parsed)));
}

function ValidationList({ messages }: { messages: string[] }) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <ul className="mb-3 rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-dten-red">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}

function WarningList({ messages }: { messages: string[] }) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <ul className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-dten-amber">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">{label}</span>
      <input
        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-ink-800 outline-none focus:border-dten-blue disabled:bg-slate-100 disabled:text-ink-600"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        disabled={disabled}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">{label}</span>
      <textarea
        className="min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-ink-800 outline-none focus:border-dten-blue"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">{label}</span>
      <select
        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-ink-800 outline-none focus:border-dten-blue disabled:bg-slate-100 disabled:text-ink-600"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        {children}
      </select>
    </label>
  );
}
