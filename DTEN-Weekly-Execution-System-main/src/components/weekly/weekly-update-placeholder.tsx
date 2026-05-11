"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { KRMonthlyPacingSummary } from "@/components/okrs/kr-monthly-pacing";
import {
  loadLocalOkrStore,
  replaceLocalCheckInsForUserWeek,
  saveLocalOkrStore,
  upsertLocalWeeklyReport,
} from "@/lib/local-okr-store";
import { mergeById } from "@/lib/merge-by-id";
import { mockCurrentDate } from "@/lib/mock-current-date";
import { checkIns, keyResults, objectives, quarters, weeklyReports } from "@/mock-data";
import { useMockSessionUser } from "@/lib/mock-session";
import { isObjectiveEligibleForRollup } from "@/lib/okr-rollups";
import { deriveKRPacingStatus } from "@/lib/kr-monthly-checkpoints";
import {
  deriveOkrUpdateStatus,
  getActiveObjectivesForUser,
  getCheckInsForUserWeek,
  getCurrentWeek,
  getPreviousWeeklyReport,
  getWeeklyReportForWeek,
  isValidCheckIn,
} from "@/lib/weekly-execution";
import { deriveWeeklyReminderStatus, getWeeklyDraftStorageKey, getWeeklyReminderCta, weeklyReminderStatusTone } from "@/lib/weekly-reminder-status";
import { isValidTrackerUrl } from "@/lib/tracker-link-helpers";
import type {
  CheckIn,
  Confidence,
  KeyResult,
  KeyResultStatus,
  Objective,
  ObjectiveStatus,
  TrackerLink,
  TrackerLinkType,
  ManagerReviewStatus,
  WeeklyPriorityFollowUpStatus,
  WeeklyPriority,
  WeeklyReport,
} from "@/types";

type KrDraft = {
  currentValue: string;
  progressPercent: string;
  status: KeyResultStatus | "";
  note: string;
};

type ObjectiveDraft = {
  status: ObjectiveStatus | "";
  confidence: Confidence | "";
  note: string;
  keyResults: Record<string, KrDraft>;
};

type FollowUpDraft = {
  id: string;
  previousPriorityText: string;
  status: WeeklyPriorityFollowUpStatus;
  note: string;
  isTopPriority: boolean;
  linkedKeyResultId: string | null;
  linkedObjectiveId: string | null;
  priorityType: WeeklyPriority["priorityType"];
  trackerLinks: TrackerLink[];
};

type WeeklyPriorityDraft = {
  id: string;
  text: string;
  priorityRank: number;
  isTopPriority: boolean;
  linkedKeyResultId: string;
  linkedObjectiveId: string;
  priorityType: WeeklyPriority["priorityType"];
  trackerLinks: TrackerLink[];
};

type WeeklyUpdateDraft = {
  objectiveDrafts: Record<string, ObjectiveDraft>;
  followUps: FollowUpDraft[];
  nextPriorities: [string, string, string];
  priorityDrafts?: WeeklyPriorityDraft[];
  challengesComments: string;
  savedAt: string;
};

type SubmitStatus = "Not started" | "Draft saved" | "Submitted" | "Partially updated" | "Missing / overdue" | "No active OKRs";

const followUpStatuses: WeeklyPriorityFollowUpStatus[] = ["Completed", "Partially completed", "Not completed", "No longer relevant"];
const objectiveStatuses: ObjectiveStatus[] = ["Active", "At Risk", "Off Track", "Completed", "On Hold"];
const keyResultStatuses: KeyResultStatus[] = ["Not Started", "On Track", "At Risk", "Off Track", "Completed"];
const confidenceOptions: Confidence[] = ["High", "Medium", "Low"];
const trackerLinkTypes: TrackerLinkType[] = ["google_doc", "google_sheet", "crm_report", "dashboard", "other"];

export function WeeklyUpdatePlaceholder() {
  const activeUser = useMockSessionUser();
  const [store, setStore] = useState(() => loadLocalOkrStore());
  const [objectiveDrafts, setObjectiveDrafts] = useState<Record<string, ObjectiveDraft>>({});
  const [followUps, setFollowUps] = useState<FollowUpDraft[]>([]);
  const [priorityDrafts, setPriorityDrafts] = useState<WeeklyPriorityDraft[]>(() => createBlankPriorityDrafts());
  const [challengesComments, setChallengesComments] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  const week = useMemo(() => getCurrentWeek(), []);
  const activeQuarterId = quarters.find((quarter) => quarter.isActive)?.id ?? quarters[0].id;
  const mergedObjectives = useMemo(() => mergeById(objectives, store.objectives), [store.objectives]);
  const mergedKeyResults = useMemo(() => mergeById(keyResults, store.keyResults), [store.keyResults]);
  const mergedCheckIns = useMemo(() => mergeById(checkIns, store.checkIns), [store.checkIns]);
  const mergedWeeklyReports = useMemo(() => mergeById(weeklyReports, store.weeklyReports), [store.weeklyReports]);
  const topPriorityTexts = getTopPriorityTuple(priorityDrafts);

  const activeObjectives = useMemo(
    () => getActiveObjectivesForUser(activeUser.id, { objectives: mergedObjectives, quarterId: activeQuarterId, week }),
    [activeQuarterId, activeUser.id, mergedObjectives, week],
  );
  const currentReport = useMemo(
    () => getWeeklyReportForWeek(activeUser.id, { weeklyReports: mergedWeeklyReports, week }),
    [activeUser.id, mergedWeeklyReports, week],
  );
  const previousReport = useMemo(
    () => getPreviousWeeklyReport(activeUser.id, { weeklyReports: mergedWeeklyReports, week }),
    [activeUser.id, mergedWeeklyReports, week],
  );
  const savedCheckInsForWeek = useMemo(
    () => getCheckInsForUserWeek(activeUser.id, { checkIns: mergedCheckIns, objectives: mergedObjectives, week }),
    [activeUser.id, mergedCheckIns, mergedObjectives, week],
  );
  const draftCheckIns = useMemo(
    () => buildCheckInsFromDrafts(activeUser.id, week.week_start_date, objectiveDrafts),
    [activeUser.id, objectiveDrafts, week.week_start_date],
  );
  const visibleCheckInsForWeek = mergeById(savedCheckInsForWeek, draftCheckIns);
  const displayStatus = deriveOkrUpdateStatus(activeObjectives, visibleCheckInsForWeek);
  const weeklyCoverage = getWeeklyOkrCoverage(activeObjectives, mergedKeyResults, visibleCheckInsForWeek);
  const hasDraftActivity = useMemo(
    () => hasWeeklyDraftActivity(priorityDrafts, challengesComments, followUps, objectiveDrafts),
    [challengesComments, followUps, priorityDrafts, objectiveDrafts],
  );
  const submitStatus = deriveSubmitStatus(currentReport, displayStatus, week, hasDraftActivity);
  const primaryCta = getWeeklyReminderCta(submitStatus);
  const readinessItems = getReadinessItems({
    activeObjectives,
    displayStatus,
    draftCheckIns,
    followUps,
    priorityDrafts,
    challengesComments,
  });
  const activeKeyResultOptions = useMemo(
    () => getActiveKeyResultOptions(activeObjectives, mergedKeyResults),
    [activeObjectives, mergedKeyResults],
  );

  useEffect(() => {
    const refreshStore = () => setStore(loadLocalOkrStore());
    refreshStore();
    window.addEventListener("dten-local-okrs-updated", refreshStore);

    return () => window.removeEventListener("dten-local-okrs-updated", refreshStore);
  }, []);

  useEffect(() => {
    setMessage(null);
    setErrors([]);
    const savedDraft = currentReport?.submittedAt ? null : loadWeeklyUpdateDraft(activeUser.id, week.week_start_date);

    if (savedDraft) {
      setObjectiveDrafts(savedDraft.objectiveDrafts);
      setFollowUps(savedDraft.followUps.map((followUp) => normalizeFollowUpDraft(followUp, previousReport)));
      setPriorityDrafts(savedDraft.priorityDrafts ?? createPriorityDraftsFromTuple(savedDraft.nextPriorities));
      setChallengesComments(savedDraft.challengesComments);
      setDraftSavedAt(savedDraft.savedAt);
      return;
    }

    setObjectiveDrafts(createObjectiveDrafts(activeObjectives, mergedKeyResults, savedCheckInsForWeek));
    setFollowUps(createFollowUpDrafts(previousReport, currentReport));
    setPriorityDrafts(createPriorityDraftsFromReport(currentReport));
    setChallengesComments(currentReport?.challengesComments ?? "");
    setDraftSavedAt(null);
  }, [activeObjectives, activeUser.id, currentReport, mergedKeyResults, previousReport, savedCheckInsForWeek, week.week_start_date]);

  function updateFollowUp(id: string, updates: Partial<FollowUpDraft>) {
    setFollowUps((drafts) => drafts.map((draft) => (draft.id === id ? { ...draft, ...updates } : draft)));
  }

  function updateObjectiveDraft(objectiveId: string, updates: Partial<Omit<ObjectiveDraft, "keyResults">>) {
    setObjectiveDrafts((drafts) => ({
      ...drafts,
      [objectiveId]: {
        ...drafts[objectiveId],
        ...updates,
      },
    }));
  }

  function updateKrDraft(objectiveId: string, keyResultId: string, updates: Partial<KrDraft>) {
    setObjectiveDrafts((drafts) => ({
      ...drafts,
      [objectiveId]: {
        ...drafts[objectiveId],
        keyResults: {
          ...drafts[objectiveId]?.keyResults,
          [keyResultId]: {
            ...drafts[objectiveId]?.keyResults[keyResultId],
            ...updates,
          },
        },
      },
    }));
  }

  function updatePriorityDraft(priorityId: string, updates: Partial<WeeklyPriorityDraft>) {
    setPriorityDrafts((drafts) =>
      drafts.map((draft) => {
        if (draft.id !== priorityId) {
          return draft;
        }

        const nextDraft = { ...draft, ...updates };
        if (updates.priorityType === "ad_hoc") {
          nextDraft.linkedKeyResultId = "";
          nextDraft.linkedObjectiveId = "";
        }

        return nextDraft;
      }),
    );
  }

  function linkPriorityToKeyResult(priorityId: string, keyResultId: string) {
    const option = activeKeyResultOptions.find((item) => item.keyResult.id === keyResultId);
    updatePriorityDraft(priorityId, {
      priorityType: "linked_key_result",
      linkedKeyResultId: keyResultId,
      linkedObjectiveId: option?.objective.id ?? "",
    });
  }

  function addAdditionalPriority() {
    setPriorityDrafts((drafts) => [
      ...drafts,
      createPriorityDraft({
        priorityRank: drafts.length + 1,
        isTopPriority: false,
      }),
    ]);
  }

  function removePriority(priorityId: string) {
    setPriorityDrafts((drafts) => normalizePriorityRanks(drafts.filter((draft) => draft.id !== priorityId)));
  }

  function addPriorityTrackerLink(priorityId: string) {
    setPriorityDrafts((drafts) =>
      drafts.map((draft) =>
        draft.id === priorityId
          ? {
              ...draft,
              trackerLinks: [
                ...draft.trackerLinks,
                {
                  id: `draft-priority-tracker-${crypto.randomUUID()}`,
                  title: "",
                  url: "",
                  type: "google_doc",
                  addedByUserId: activeUser.id,
                  addedAt: new Date().toISOString(),
                },
              ],
            }
          : draft,
      ),
    );
  }

  function updatePriorityTrackerLink(priorityId: string, trackerLinkId: string, updates: Partial<TrackerLink>) {
    setPriorityDrafts((drafts) =>
      drafts.map((draft) =>
        draft.id === priorityId
          ? {
              ...draft,
              trackerLinks: draft.trackerLinks.map((trackerLink) => (trackerLink.id === trackerLinkId ? { ...trackerLink, ...updates } : trackerLink)),
            }
          : draft,
      ),
    );
  }

  function removePriorityTrackerLink(priorityId: string, trackerLinkId: string) {
    setPriorityDrafts((drafts) =>
      drafts.map((draft) =>
        draft.id === priorityId
          ? { ...draft, trackerLinks: draft.trackerLinks.filter((trackerLink) => trackerLink.id !== trackerLinkId) }
          : draft,
      ),
    );
  }

  function submitWeeklyReport() {
    setMessage(null);
    const nextErrors = validateWeeklyReport(priorityDrafts, challengesComments, followUps, objectiveDrafts);
    setErrors(nextErrors);

    if (nextErrors.length > 0) {
      return;
    }

    const timestamp = new Date().toISOString();
    const nextCheckIns = buildCheckInsFromDrafts(activeUser.id, week.week_start_date, objectiveDrafts);
    const nextReport: WeeklyReport = {
      id: currentReport?.id ?? `local-weekly-report-${activeUser.id}-${week.week_start_date}`,
      userId: activeUser.id,
      quarterId: activeQuarterId,
      weekStartDate: week.week_start_date,
      weekEndDate: week.week_end_date,
      okrUpdateStatus: deriveOkrUpdateStatus(activeObjectives, nextCheckIns),
      lastWeekPriorityFollowUps: followUps.map((followUp) => ({
        id: followUp.id,
        previousPriorityText: followUp.previousPriorityText,
        status: followUp.status,
        note: followUp.note.trim() || null,
      })),
      weeklyPriorities: toWeeklyPriorities(priorityDrafts),
      nextWeekPriorities: toNextPriorityTuple(priorityDrafts),
      challengesComments: challengesComments.trim() || null,
      managerReviewStatus: "not_reviewed",
      reviewedByUserId: null,
      reviewedAt: null,
      managerReviewNote: null,
      submittedAt: timestamp,
      updatedAt: timestamp,
    };

    let nextStore = replaceLocalCheckInsForUserWeek(loadLocalOkrStore(), activeUser.id, week.week_start_date, week.week_end_date, nextCheckIns);
    nextStore = upsertLocalWeeklyReport(nextStore, nextReport);
    saveLocalOkrStore(nextStore);
    clearWeeklyUpdateDraft(activeUser.id, week.week_start_date);
    setStore(nextStore);
    setMessage(currentReport ? "Weekly report updated." : "Weekly report submitted.");
    setDraftSavedAt(null);
  }

  function saveDraft() {
    const savedAt = new Date().toISOString();
    saveWeeklyUpdateDraft(activeUser.id, week.week_start_date, {
      objectiveDrafts,
      followUps,
      nextPriorities: topPriorityTexts,
      priorityDrafts,
      challengesComments,
      savedAt,
    });
    setDraftSavedAt(savedAt);
    setMessage("Draft saved. Submit when the weekly update is ready.");
    setErrors([]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly Update"
        description="Complete your KR check-ins and weekly report in one flow."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/weekly-history">
              <Button variant="secondary">View History</Button>
            </Link>
            <Button variant="secondary" onClick={saveDraft}>Save Draft</Button>
            {submitStatus === "Submitted" ? (
              <Link href="/weekly-history" className="inline-flex min-h-10 items-center justify-center rounded-md border border-dten-blue bg-dten-blue px-4 text-sm font-semibold text-white transition hover:bg-blue-700">
                {primaryCta}
              </Link>
            ) : (
              <Button variant="primary" onClick={submitWeeklyReport}>Submit Weekly Update</Button>
            )}
          </div>
        }
      />

      {message ? <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-dten-blue">{message}</div> : null}
      {errors.length > 0 ? (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-dten-red">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}

      <WeeklyUpdateHeaderCard
        weekRange={formatWeek(week.week_start_date, week.week_end_date)}
        okrUpdateStatus={displayStatus}
        submitStatus={submitStatus}
        managerReviewStatus={currentReport?.managerReviewStatus ?? null}
        reviewedAt={currentReport?.reviewedAt ?? null}
        draftSavedAt={draftSavedAt}
      />

      <WeeklyOkrConnectionCard coverage={weeklyCoverage} />

      <WeeklyFlowProgress
        steps={[
          { label: "Review last week", complete: followUps.length === 0 || followUps.every((followUp) => Boolean(followUp.status)) },
          { label: "Update OKR / KR progress", complete: displayStatus === "Partially Updated" || displayStatus === "Updated" },
          { label: "Set next week priorities", complete: Boolean(topPriorityTexts[0].trim()) },
          { label: "Share blockers / comments", complete: Boolean(challengesComments.trim()), optional: true },
          { label: "Submit weekly update", complete: submitStatus === "Submitted" },
        ]}
      />

      <SectionCard
        number="1"
        title="Last Week Follow-up"
        description="Close the loop on last week's plain-text priorities. These are not tasks."
      >
        <CardContent className="space-y-4">
          {followUps.length === 0 ? (
            <EmptyState title="No previous priorities" description="There is no prior weekly report for this mock user." />
          ) : (
            followUps.map((followUp) => (
              <div key={followUp.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={followUp.isTopPriority ? "info" : "neutral"}>{followUp.isTopPriority ? "Top 3" : "Additional"}</Badge>
                      {followUp.priorityType === "linked_key_result" ? <Badge tone="info">Linked KR</Badge> : <Badge tone="neutral">Ad hoc / operational</Badge>}
                    </div>
                    <p className="mt-2 font-semibold text-ink-950">{followUp.previousPriorityText}</p>
                    {followUp.priorityType === "linked_key_result" ? (
                      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-600">
                        Linked Objective/KR: {getLinkedPriorityLabel(followUp, activeKeyResultOptions)}
                      </p>
                    ) : null}
                  </div>
                </div>
                <TrackerLinksPreview trackerLinks={followUp.trackerLinks} />
                <div className="mt-4 grid gap-4 md:grid-cols-[260px_1fr]">
                  <SelectField
                    label="Follow-up status"
                    value={followUp.status}
                    onChange={(value) => updateFollowUp(followUp.id, { status: value as WeeklyPriorityFollowUpStatus })}
                  >
                    {followUpStatuses.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </SelectField>
                  <TextField
                    label="Optional note"
                    value={followUp.note}
                    onChange={(value) => updateFollowUp(followUp.id, { note: value })}
                    placeholder="Short note about progress or context."
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </SectionCard>

      <SectionCard
        number="2"
        title="OKR / KR Check-ins"
        description="Update progress from your active Objectives and Key Results. A valid check-in changes progress or status, confirms status/confidence, or adds useful context."
      >
        <CardContent className="space-y-5">
          {activeObjectives.length === 0 ? (
            <EmptyState title="No active OKRs" description="This user has no active approved OKRs for the selected quarter and week." />
          ) : (
            activeObjectives.map((objective) => (
              <ObjectiveCheckInCard
                key={objective.id}
                objective={objective}
                keyResults={mergedKeyResults.filter((keyResult) => keyResult.objectiveId === objective.id)}
                objectives={mergedObjectives}
                checkInsForWeek={visibleCheckInsForWeek}
                draft={objectiveDrafts[objective.id]}
                onObjectiveChange={(updates) => updateObjectiveDraft(objective.id, updates)}
                onKrChange={(keyResultId, updates) => updateKrDraft(objective.id, keyResultId, updates)}
              />
            ))
          )}
        </CardContent>
      </SectionCard>

      <SectionCard
        number="3"
        title="Top 3 Priorities for Next Week"
        description="Plain-text focus areas for next week. Priority 1 is required; no assignments, due dates, or task tracking are created."
      >
        <CardContent className="space-y-4">
          {priorityDrafts.slice(0, 3).map((priority, index) => (
            <WeeklyPriorityEditor
              key={priority.id}
              priority={priority}
              label={`Priority ${index + 1}${index === 0 ? " required" : ""}`}
              emphasized
              keyResultOptions={activeKeyResultOptions}
              onChange={(updates) => updatePriorityDraft(priority.id, updates)}
              onKeyResultSelect={(keyResultId) => linkPriorityToKeyResult(priority.id, keyResultId)}
              onAddTrackerLink={() => addPriorityTrackerLink(priority.id)}
              onUpdateTrackerLink={(trackerLinkId, updates) => updatePriorityTrackerLink(priority.id, trackerLinkId, updates)}
              onRemoveTrackerLink={(trackerLinkId) => removePriorityTrackerLink(priority.id, trackerLinkId)}
            />
          ))}
        </CardContent>
      </SectionCard>

      <SectionCard
        number="3a"
        title="Additional Priorities"
        description="Optional secondary focus items. Keep these as plain-text execution intentions, not tasks."
      >
        <CardContent className="space-y-4">
          {priorityDrafts.filter((priority) => !priority.isTopPriority).length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-ink-600">No additional priorities added.</p>
            </div>
          ) : (
            priorityDrafts
              .filter((priority) => !priority.isTopPriority)
              .map((priority) => (
                <WeeklyPriorityEditor
                  key={priority.id}
                  priority={priority}
                  label={`Additional priority ${priority.priorityRank - 3}`}
                  keyResultOptions={activeKeyResultOptions}
                  onChange={(updates) => updatePriorityDraft(priority.id, updates)}
                  onKeyResultSelect={(keyResultId) => linkPriorityToKeyResult(priority.id, keyResultId)}
                  onRemove={() => removePriority(priority.id)}
                  onAddTrackerLink={() => addPriorityTrackerLink(priority.id)}
                  onUpdateTrackerLink={(trackerLinkId, updates) => updatePriorityTrackerLink(priority.id, trackerLinkId, updates)}
                  onRemoveTrackerLink={(trackerLinkId) => removePriorityTrackerLink(priority.id, trackerLinkId)}
                />
              ))
          )}
          <Button variant="secondary" onClick={addAdditionalPriority}>Add additional priority</Button>
        </CardContent>
      </SectionCard>

      <SectionCard
        number="4"
        title="Challenges / Support Needed"
        description="Share risks, blockers, manager support needed, or broader comments in plain text."
      >
        <CardContent className="space-y-4">
          <TextAreaField
            label="Risks, blockers, support needed, or broader comments"
            value={challengesComments}
            onChange={setChallengesComments}
            placeholder="Example: Need manager help unblocking a launch decision. No task, assignee, or due date will be created."
          />
        </CardContent>
      </SectionCard>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink-950">Submit Weekly Update</h2>
              <p className="mt-1 text-sm text-ink-600">Review what is ready and what still needs attention before submitting.</p>
            </div>
            <Badge tone={submitStatusTone(submitStatus)}>{submitStatus}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ValidationSummary items={readinessItems} />
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
            <Button variant="secondary" onClick={saveDraft}>Save Draft</Button>
            {submitStatus === "Submitted" ? (
              <Link href="/weekly-history" className="inline-flex min-h-10 items-center justify-center rounded-md border border-dten-blue bg-dten-blue px-4 text-sm font-semibold text-white transition hover:bg-blue-700">
                {primaryCta}
              </Link>
            ) : (
              <Button variant="primary" onClick={submitWeeklyReport}>Submit Weekly Update</Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WeeklyUpdateHeaderCard({
  weekRange,
  okrUpdateStatus,
  submitStatus,
  managerReviewStatus,
  reviewedAt,
  draftSavedAt,
}: {
  weekRange: string;
  okrUpdateStatus: ReturnType<typeof deriveOkrUpdateStatus>;
  submitStatus: SubmitStatus;
  managerReviewStatus: ManagerReviewStatus | null;
  reviewedAt: string | null;
  draftSavedAt: string | null;
}) {
  const primaryCta = getWeeklyReminderCta(submitStatus);

  return (
    <Card>
      <CardContent className="grid gap-4 py-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
        <div>
          <p className="text-sm font-medium text-ink-600">Week range</p>
          <p className="mt-2 text-xl font-semibold text-ink-950">{weekRange}</p>
          <p className="mt-2 text-sm leading-6 text-ink-600">Review last week, update KRs, set next priorities, and share support needs.</p>
        </div>
        <StatusSummary label="Current update status" value={okrUpdateStatus} tone={statusTone(okrUpdateStatus)} />
        <StatusSummary label="Submit status" value={submitStatus} tone={submitStatusTone(submitStatus)} action={primaryCta} />
        <StatusSummary
          label="Manager review"
          value={managerReviewStatus ? formatManagerReviewStatus(managerReviewStatus) : "Draft"}
          tone={managerReviewStatus ? managerReviewStatusTone(managerReviewStatus) : "neutral"}
          action={reviewedAt ? `Reviewed ${formatDateTime(reviewedAt)}` : undefined}
        />
        {draftSavedAt ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-600 lg:col-span-3">
            Draft saved {formatDateTime(draftSavedAt)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatusSummary({
  label,
  value,
  tone,
  action,
}: {
  label: string;
  value: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
  action?: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-ink-600">{label}</p>
      <div className="mt-3">
        <Badge tone={tone}>{value}</Badge>
      </div>
      {action ? <p className="mt-3 text-sm font-semibold text-ink-800">{action}</p> : null}
    </div>
  );
}

function WeeklyFlowProgress({
  steps,
}: {
  steps: { label: string; complete: boolean; optional?: boolean }[];
}) {
  const completeCount = steps.filter((step) => step.complete || step.optional).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-950">Weekly Flow</h2>
            <p className="mt-1 text-sm text-ink-600">Move through the update rhythm from last week follow-up to submission.</p>
          </div>
          <Badge tone="info">{completeCount}/{steps.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-5">
        {steps.map((step, index) => (
          <div key={step.label} className={`rounded-md border p-3 ${step.complete ? "border-emerald-100 bg-emerald-50" : "border-slate-200 bg-white"}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Step {index + 1}</p>
            <p className="mt-2 text-sm font-semibold text-ink-950">{step.label}</p>
            <p className="mt-2 text-xs font-semibold text-ink-600">{step.complete ? "Ready" : step.optional ? "Optional" : "Needs input"}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SectionCard({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-dten-blue ring-1 ring-blue-100">
            {number}
          </div>
          <div>
            <h2 className="text-base font-semibold text-ink-950">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-ink-600">{description}</p>
          </div>
        </div>
      </CardHeader>
      {children}
    </Card>
  );
}

function ValidationSummary({ items }: { items: { label: string; complete: boolean; detail: string; blocking?: boolean }[] }) {
  const missingItems = items.filter((item) => !item.complete);

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-950">Validation summary</h3>
          <p className="mt-1 text-sm text-ink-600">What is ready and what is still missing.</p>
        </div>
        <Badge tone={missingItems.some((item) => item.blocking) ? "warning" : "success"}>
          {missingItems.length === 0 ? "Ready to submit" : `${missingItems.length} item${missingItems.length === 1 ? "" : "s"} to review`}
        </Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="rounded-md border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink-950">{item.label}</p>
              <Badge tone={item.complete ? "success" : item.blocking ? "warning" : "neutral"}>{item.complete ? "Ready" : "Missing"}</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-ink-600">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeeklyPriorityEditor({
  priority,
  label,
  emphasized = false,
  keyResultOptions,
  onChange,
  onKeyResultSelect,
  onRemove,
  onAddTrackerLink,
  onUpdateTrackerLink,
  onRemoveTrackerLink,
}: {
  priority: WeeklyPriorityDraft;
  label: string;
  emphasized?: boolean;
  keyResultOptions: ReturnType<typeof getActiveKeyResultOptions>;
  onChange: (updates: Partial<WeeklyPriorityDraft>) => void;
  onKeyResultSelect: (keyResultId: string) => void;
  onRemove?: () => void;
  onAddTrackerLink: () => void;
  onUpdateTrackerLink: (trackerLinkId: string, updates: Partial<TrackerLink>) => void;
  onRemoveTrackerLink: (trackerLinkId: string) => void;
}) {
  const selectedOption = keyResultOptions.find((option) => option.keyResult.id === priority.linkedKeyResultId);

  return (
    <div className={`rounded-lg border p-4 ${emphasized ? "border-blue-100 bg-blue-50/40" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={emphasized ? "info" : "neutral"}>{label}</Badge>
            {priority.priorityType === "ad_hoc" ? <Badge tone="neutral">Ad hoc / operational</Badge> : <Badge tone="info">Linked to Key Result</Badge>}
          </div>
          <p className="mt-2 text-sm leading-6 text-ink-600">Weekly priorities stay plain text. No assignee, due date, or task workflow is created.</p>
        </div>
        {onRemove ? (
          <button type="button" onClick={onRemove} className="text-sm font-semibold text-dten-red">
            Remove
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <TextField
          label="Priority text"
          value={priority.text}
          onChange={(value) => onChange({ text: value })}
          placeholder="Describe the execution intention for next week."
        />
        <SelectField
          label="Priority link type"
          value={priority.priorityType}
          onChange={(value) => onChange({ priorityType: value as WeeklyPriority["priorityType"] })}
        >
          <option value="linked_key_result">Linked to Key Result</option>
          <option value="ad_hoc">Ad hoc / operational</option>
        </SelectField>
      </div>

      {priority.priorityType === "linked_key_result" ? (
        <div className="mt-4">
          <SelectField
            label="Linked Key Result"
            value={priority.linkedKeyResultId}
            onChange={onKeyResultSelect}
          >
            <option value="">Select a Key Result</option>
            {keyResultOptions.map((option) => (
              <option key={option.keyResult.id} value={option.keyResult.id}>
                {option.objective.title} / {option.keyResult.title}
              </option>
            ))}
          </SelectField>
          {selectedOption ? (
            <div className="mt-3 rounded-md border border-blue-100 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Linked Objective</p>
              <p className="mt-1 text-sm font-semibold text-ink-950">{selectedOption.objective.title}</p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-600">Linked KR</p>
              <p className="mt-1 text-sm font-semibold text-ink-950">{selectedOption.keyResult.title}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Optional tracker links</p>
          <Button variant="secondary" onClick={onAddTrackerLink}>Add tracker link</Button>
        </div>
        {priority.trackerLinks.length === 0 ? (
          <p className="mt-3 text-sm text-ink-600">No tracker links added.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {priority.trackerLinks.map((trackerLink, index) => (
              <div key={trackerLink.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Tracker link {index + 1}</p>
                  <button type="button" onClick={() => onRemoveTrackerLink(trackerLink.id)} className="text-xs font-semibold uppercase tracking-wide text-dten-red">
                    Remove
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <TextField
                    label="Link title"
                    value={trackerLink.title}
                    onChange={(value) => onUpdateTrackerLink(trackerLink.id, { title: value })}
                  />
                  <SelectField
                    label="Type"
                    value={trackerLink.type}
                    onChange={(value) => onUpdateTrackerLink(trackerLink.id, { type: value as TrackerLinkType })}
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
                    onChange={(value) => onUpdateTrackerLink(trackerLink.id, { url: value })}
                    placeholder="https://..."
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TrackerLinksPreview({ trackerLinks }: { trackerLinks: TrackerLink[] }) {
  if (trackerLinks.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Tracker links</p>
      <div className="mt-2 flex flex-wrap gap-2">
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
    </div>
  );
}

function getLinkedPriorityLabel(followUp: FollowUpDraft, keyResultOptions: ReturnType<typeof getActiveKeyResultOptions>) {
  const option = keyResultOptions.find((item) => item.keyResult.id === followUp.linkedKeyResultId);
  return option ? `${option.objective.title} / ${option.keyResult.title}` : "Linked KR not visible in active OKRs";
}

function SignalBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink-950">{value}</p>
    </div>
  );
}

function WeeklyOkrConnectionCard({ coverage }: { coverage: WeeklyOkrCoverage }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-950">Active Objectives This Week</h2>
            <p className="mt-1 text-sm text-ink-600">Weekly updates are connected directly to Objectives and their Key Results.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="info">{coverage.activeObjectiveCount} active OKRs</Badge>
            <Badge tone="success">{coverage.updatedKrCount} KRs updated</Badge>
            <Badge tone={coverage.needsCheckInKrCount > 0 ? "warning" : "success"}>{coverage.needsCheckInKrCount} KRs need check-in</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {coverage.objectives.length === 0 ? (
          <EmptyState title="No active OKRs" description="Weekly updates will connect here once this user has active approved Objectives and Key Results." />
        ) : (
          coverage.objectives.map((item) => (
            <div key={item.objective.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">Objective</Badge>
                  <p className="font-semibold text-ink-950">{item.objective.title}</p>
                </div>
                <Badge tone={item.needsCheckInCount > 0 ? "warning" : "success"}>
                  {item.updatedCount} / {item.keyResults.length} KRs updated
                </Badge>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {item.keyResults.map((keyResult) => (
                  <div key={keyResult.id} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
                    <p className="line-clamp-2 text-sm font-semibold text-ink-950">{keyResult.title}</p>
                    <Badge tone={item.updatedKeyResultIds.has(keyResult.id) ? "success" : "warning"}>
                      {item.updatedKeyResultIds.has(keyResult.id) ? "Updated this week" : "Needs check-in"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ObjectiveCheckInCard({
  objective,
  keyResults: objectiveKeyResults,
  objectives: mergedObjectives,
  checkInsForWeek,
  draft,
  onObjectiveChange,
  onKrChange,
}: {
  objective: Objective;
  keyResults: KeyResult[];
  objectives: Objective[];
  checkInsForWeek: CheckIn[];
  draft?: ObjectiveDraft;
  onObjectiveChange: (updates: Partial<Omit<ObjectiveDraft, "keyResults">>) => void;
  onKrChange: (keyResultId: string, updates: Partial<KrDraft>) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">Objective</Badge>
            <h3 className="text-base font-semibold text-ink-950">{objective.title}</h3>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge status={objective.status} />
            <ConfidenceBadge confidence={objective.confidence} />
            <Badge tone="neutral">Score {objective.score}%</Badge>
          </div>
        </div>
        <div className="w-full lg:w-56">
          <ProgressBar value={objective.score} label="Objective score" />
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {objectiveKeyResults.length === 0 ? (
          <EmptyState title="No KRs" description="This active OKR does not have key results yet." />
        ) : (
          objectiveKeyResults.map((keyResult) => {
            const krDraft = draft?.keyResults[keyResult.id] ?? createEmptyKrDraft();
            const pacingKeyResult = getDraftPacingKeyResult(keyResult, krDraft);
            const krUpdatedThisWeek = checkInsForWeek.some((checkIn) => checkIn.keyResultId === keyResult.id && isValidCheckIn(checkIn));
            const linkedChildObjective = keyResult.linkedChildObjectiveId
              ? mergedObjectives.find((item) => item.id === keyResult.linkedChildObjectiveId)
              : undefined;
            const isReadOnlyRollup = isObjectiveEligibleForRollup(linkedChildObjective);

            return (
              <div key={keyResult.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">Key Result</Badge>
                      <p className="font-semibold text-ink-950">{keyResult.title}</p>
                      <Badge tone={krUpdatedThisWeek ? "success" : "warning"}>{krUpdatedThisWeek ? "Updated this week" : "Needs check-in"}</Badge>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <SignalBox label="Quarterly progress" value={`${pacingKeyResult.currentValue ?? "N/A"} / ${pacingKeyResult.progressPercent}%`} />
                      <SignalBox label="KR status" value={krDraft.status || keyResult.status} />
                      <SignalBox label="Objective confidence" value={draft?.confidence || objective.confidence} />
                    </div>
                    <div className="mt-3 rounded-md border border-blue-100 bg-white px-3 py-2">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-600">
                        Monthly target helps you see whether this KR is on pace before quarter end.
                      </p>
                      <KRMonthlyPacingSummary keyResult={pacingKeyResult} />
                      {deriveKRPacingStatus(pacingKeyResult, mockCurrentDate) === "Behind" ? (
                        <p className="mt-2 text-sm font-semibold text-dten-amber">This KR is behind the current monthly checkpoint.</p>
                      ) : null}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <SignalBox label="Manual status context" value={keyResult.status} />
                      <SignalBox label="Updated status" value={krDraft.status || "No update"} />
                      <SignalBox label="Metric" value={keyResult.metricType} />
                    </div>
                  </div>
                  <Badge tone="neutral">{keyResult.metricType}</Badge>
                </div>
                {keyResult.linkedChildObjectiveId ? (
                  <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-dten-blue">
                    Auto-updated from linked objective. {isReadOnlyRollup ? "Progress and status are read-only here." : "Pending approved active child objective."}
                  </div>
                ) : null}
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <TextField
                    label="Current value"
                    type="number"
                    value={krDraft.currentValue}
                    onChange={(value) => onKrChange(keyResult.id, { currentValue: value })}
                    placeholder={keyResult.currentValue?.toString() ?? ""}
                    disabled={isReadOnlyRollup}
                  />
                  <TextField
                    label="Progress percent"
                    type="number"
                    value={krDraft.progressPercent}
                    onChange={(value) => onKrChange(keyResult.id, { progressPercent: clampPercentInput(value) })}
                    placeholder={keyResult.progressPercent.toString()}
                    disabled={isReadOnlyRollup}
                  />
                  <SelectField
                    label="KR status"
                    value={krDraft.status}
                    onChange={(value) => onKrChange(keyResult.id, { status: value as KeyResultStatus | "" })}
                    disabled={isReadOnlyRollup}
                  >
                    <option value="">No update</option>
                    {keyResultStatuses.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </SelectField>
                  <TextField
                    label="Weekly KR note"
                    value={krDraft.note}
                    onChange={(value) => onKrChange(keyResult.id, { note: value })}
                    placeholder="What changed this week?"
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-5 rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-4">
          <p className="text-sm font-semibold text-ink-950">Objective-level update</p>
          <p className="mt-1 text-sm text-ink-600">Status and confidence stay separate from numeric score.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <SelectField label="Objective status" value={draft?.status ?? ""} onChange={(value) => onObjectiveChange({ status: value as ObjectiveStatus | "" })}>
            <option value="">No update</option>
            {objectiveStatuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </SelectField>
          <SelectField label="Objective confidence" value={draft?.confidence ?? ""} onChange={(value) => onObjectiveChange({ confidence: value as Confidence | "" })}>
            <option value="">No update</option>
            {confidenceOptions.map((confidence) => (
              <option key={confidence}>{confidence}</option>
            ))}
          </SelectField>
          <TextField
            label="Objective summary note"
            value={draft?.note ?? ""}
            onChange={(value) => onObjectiveChange({ note: value })}
            placeholder="Progress, risk, or no-change context."
          />
        </div>
      </div>
    </div>
  );
}

function createObjectiveDrafts(activeObjectives: Objective[], mergedKeyResults: KeyResult[], existingCheckIns: CheckIn[]) {
  const drafts: Record<string, ObjectiveDraft> = {};

  activeObjectives.forEach((objective) => {
    const objectiveCheckIn = existingCheckIns.find((checkIn) => checkIn.resourceType === "objective" && checkIn.objectiveId === objective.id);
    const krDrafts: Record<string, KrDraft> = {};

    mergedKeyResults
      .filter((keyResult) => keyResult.objectiveId === objective.id)
      .forEach((keyResult) => {
        const keyResultCheckIn = existingCheckIns.find((checkIn) => checkIn.resourceType === "key_result" && checkIn.keyResultId === keyResult.id);
        krDrafts[keyResult.id] = {
          currentValue: keyResultCheckIn?.currentValue?.toString() ?? "",
          progressPercent: keyResultCheckIn?.progressPercent?.toString() ?? "",
          status: keyResultCheckIn?.keyResultStatus ?? "",
          note: keyResultCheckIn?.notes ?? "",
        };
      });

    drafts[objective.id] = {
      status: objectiveCheckIn?.objectiveStatus ?? "",
      confidence: objectiveCheckIn?.confidence ?? "",
      note: objectiveCheckIn?.notes ?? "",
      keyResults: krDrafts,
    };
  });

  return drafts;
}

type WeeklyOkrCoverage = ReturnType<typeof getWeeklyOkrCoverage>;

function getWeeklyOkrCoverage(activeObjectives: Objective[], allKeyResults: KeyResult[], checkInsForWeek: CheckIn[]) {
  const objectiveItems = activeObjectives.map((objective) => {
    const objectiveKeyResults = allKeyResults.filter((keyResult) => keyResult.objectiveId === objective.id);
    const updatedKeyResultIds = new Set(
      checkInsForWeek
        .filter((checkIn) => checkIn.resourceType === "key_result" && checkIn.keyResultId && checkIn.objectiveId === objective.id && isValidCheckIn(checkIn))
        .map((checkIn) => checkIn.keyResultId as string),
    );

    return {
      objective,
      keyResults: objectiveKeyResults,
      updatedKeyResultIds,
      updatedCount: updatedKeyResultIds.size,
      needsCheckInCount: Math.max(objectiveKeyResults.length - updatedKeyResultIds.size, 0),
    };
  });

  return {
    activeObjectiveCount: activeObjectives.length,
    updatedKrCount: objectiveItems.reduce((sum, item) => sum + item.updatedCount, 0),
    needsCheckInKrCount: objectiveItems.reduce((sum, item) => sum + item.needsCheckInCount, 0),
    objectives: objectiveItems,
  };
}

function createFollowUpDrafts(previousReport?: WeeklyReport, currentReport?: WeeklyReport): FollowUpDraft[] {
  if (currentReport?.lastWeekPriorityFollowUps.length) {
    return currentReport.lastWeekPriorityFollowUps.map((followUp) => ({
      ...createFollowUpDraftFromPriority(findPreviousPriorityForFollowUp(followUp.previousPriorityText, previousReport), followUp.id, followUp.previousPriorityText),
      status: followUp.status,
      note: followUp.note ?? "",
    }));
  }

  if (previousReport?.weeklyPriorities?.length) {
    return previousReport.weeklyPriorities
      .filter((priority) => priority.text.trim())
      .sort((a, b) => a.priorityRank - b.priorityRank)
      .map((priority, index) => createFollowUpDraftFromPriority(priority, `follow-${previousReport.id}-${index + 1}`));
  }

  return (previousReport?.nextWeekPriorities.filter((priority): priority is string => Boolean(priority)) ?? []).map((priority, index) =>
    createFollowUpDraftFromPriority(undefined, `follow-${previousReport?.id ?? "previous"}-${index + 1}`, priority),
  );
}

function createFollowUpDraftFromPriority(priority: WeeklyPriority | undefined, id: string, fallbackText?: string): FollowUpDraft {
  return {
    id,
    previousPriorityText: priority?.text ?? fallbackText ?? "",
    status: "Not completed",
    note: "",
    isTopPriority: priority?.isTopPriority ?? true,
    linkedKeyResultId: priority?.linkedKeyResultId ?? null,
    linkedObjectiveId: priority?.linkedObjectiveId ?? null,
    priorityType: priority?.priorityType ?? "ad_hoc",
    trackerLinks: priority?.trackerLinks ?? [],
  };
}

function findPreviousPriorityForFollowUp(previousPriorityText: string, previousReport?: WeeklyReport) {
  return previousReport?.weeklyPriorities?.find((priority) => priority.text.trim() === previousPriorityText.trim());
}

function normalizeFollowUpDraft(followUp: FollowUpDraft, previousReport?: WeeklyReport): FollowUpDraft {
  const matchingPriority = findPreviousPriorityForFollowUp(followUp.previousPriorityText, previousReport);

  return {
    ...createFollowUpDraftFromPriority(matchingPriority, followUp.id, followUp.previousPriorityText),
    status: followUp.status,
    note: followUp.note,
    isTopPriority: followUp.isTopPriority ?? matchingPriority?.isTopPriority ?? true,
    linkedKeyResultId: followUp.linkedKeyResultId ?? matchingPriority?.linkedKeyResultId ?? null,
    linkedObjectiveId: followUp.linkedObjectiveId ?? matchingPriority?.linkedObjectiveId ?? null,
    priorityType: followUp.priorityType ?? matchingPriority?.priorityType ?? "ad_hoc",
    trackerLinks: followUp.trackerLinks ?? matchingPriority?.trackerLinks ?? [],
  };
}

function buildCheckInsFromDrafts(userId: string, checkInDate: string, objectiveDrafts: Record<string, ObjectiveDraft>) {
  const nextCheckIns: CheckIn[] = [];
  const timestamp = new Date().toISOString();

  Object.entries(objectiveDrafts).forEach(([objectiveId, draft]) => {
    const objectiveCheckIn: CheckIn = {
      id: `local-checkin-${userId}-${checkInDate}-${objectiveId}-objective`,
      resourceType: "objective",
      objectiveId,
      keyResultId: null,
      checkInDate,
      progressUpdate: draft.note.trim(),
      objectiveStatus: draft.status || null,
      keyResultStatus: null,
      confidence: draft.confidence || null,
      progressPercent: null,
      currentValue: null,
      notes: draft.note.trim() || null,
      createdByUserId: userId,
      createdAt: timestamp,
    };

    if (isValidCheckIn(objectiveCheckIn)) {
      nextCheckIns.push(objectiveCheckIn);
    }

    Object.entries(draft.keyResults).forEach(([keyResultId, krDraft]) => {
      const keyResultCheckIn: CheckIn = {
        id: `local-checkin-${userId}-${checkInDate}-${keyResultId}`,
        resourceType: "key_result",
        objectiveId,
        keyResultId,
        checkInDate,
        progressUpdate: krDraft.note.trim(),
        objectiveStatus: null,
        keyResultStatus: krDraft.status || null,
        confidence: null,
        progressPercent: parseOptionalNumber(krDraft.progressPercent),
        currentValue: parseOptionalNumber(krDraft.currentValue),
        notes: krDraft.note.trim() || null,
        createdByUserId: userId,
        createdAt: timestamp,
      };

      if (isValidCheckIn(keyResultCheckIn)) {
        nextCheckIns.push(keyResultCheckIn);
      }
    });
  });

  return nextCheckIns;
}

function validateWeeklyReport(
  priorityDrafts: WeeklyPriorityDraft[],
  challengesComments: string,
  followUps: FollowUpDraft[],
  objectiveDrafts: Record<string, ObjectiveDraft>,
) {
  const errors: string[] = [];
  const topPriorityTexts = getTopPriorityTuple(priorityDrafts);

  if (!topPriorityTexts[0].trim()) {
    errors.push("Priority 1 for next week is required.");
  }

  priorityDrafts.forEach((priority) => {
    if (priority.text.trim() && priority.priorityType === "linked_key_result" && !priority.linkedKeyResultId) {
      errors.push(`"${priority.text.trim()}" is marked linked to a Key Result, but no KR is selected.`);
    }

    priority.trackerLinks.forEach((trackerLink, index) => {
      const hasTrackerLink = Boolean(trackerLink.title.trim() || trackerLink.url.trim());
      if (!hasTrackerLink) {
        return;
      }

      if (!trackerLink.title.trim()) {
        errors.push(`Priority ${priority.priorityRank} tracker link ${index + 1} title is required.`);
      }

      if (!trackerLink.url.trim()) {
        errors.push(`Priority ${priority.priorityRank} tracker link ${index + 1} URL is required.`);
      } else if (!isValidTrackerUrl(trackerLink.url)) {
        errors.push(`Priority ${priority.priorityRank} tracker link ${index + 1} must use a valid http or https URL.`);
      }
    });
  });

  const plainTextFields = [
    ...priorityDrafts.map((priority) => ({ label: `Weekly priority ${priority.priorityRank}`, value: priority.text })),
    { label: "Challenges and additional comments", value: challengesComments },
    ...followUps.map((followUp, index) => ({ label: `Last week follow-up note ${index + 1}`, value: followUp.note })),
    ...Object.values(objectiveDrafts).flatMap((draft) => [
      { label: "Objective summary note", value: draft.note },
      ...Object.values(draft.keyResults).map((krDraft) => ({ label: "KR note", value: krDraft.note })),
    ]),
  ];
  const richTextField = plainTextFields.find((field) => hasLikelyMarkup(field.value));

  if (richTextField) {
    errors.push(`${richTextField.label} must be plain text only.`);
  }

  const invalidKrNumber = Object.values(objectiveDrafts)
    .flatMap((draft) => Object.values(draft.keyResults))
    .find((krDraft) => !isOptionalNumber(krDraft.currentValue) || !isOptionalNumber(krDraft.progressPercent));

  if (invalidKrNumber) {
    errors.push("KR current value and progress updates must be valid numbers.");
  }

  return errors;
}

function weeklyDraftKey(userId: string, weekStartDate: string) {
  return getWeeklyDraftStorageKey(userId, weekStartDate);
}

function loadWeeklyUpdateDraft(userId: string, weekStartDate: string): WeeklyUpdateDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const savedValue = window.localStorage.getItem(weeklyDraftKey(userId, weekStartDate));
    if (!savedValue) {
      return null;
    }

    const parsedValue = JSON.parse(savedValue) as Partial<WeeklyUpdateDraft>;
    if (!parsedValue.objectiveDrafts || !parsedValue.followUps || !parsedValue.nextPriorities || !parsedValue.savedAt) {
      return null;
    }

    return {
      objectiveDrafts: parsedValue.objectiveDrafts,
      followUps: parsedValue.followUps,
      nextPriorities: parsedValue.nextPriorities,
      priorityDrafts: parsedValue.priorityDrafts ?? createPriorityDraftsFromTuple(parsedValue.nextPriorities),
      challengesComments: parsedValue.challengesComments ?? "",
      savedAt: parsedValue.savedAt,
    };
  } catch {
    return null;
  }
}

function saveWeeklyUpdateDraft(userId: string, weekStartDate: string, draft: WeeklyUpdateDraft) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(weeklyDraftKey(userId, weekStartDate), JSON.stringify(draft));
}

function clearWeeklyUpdateDraft(userId: string, weekStartDate: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(weeklyDraftKey(userId, weekStartDate));
}

function hasWeeklyDraftActivity(
  priorityDrafts: WeeklyPriorityDraft[],
  challengesComments: string,
  followUps: FollowUpDraft[],
  objectiveDrafts: Record<string, ObjectiveDraft>,
) {
  return (
    priorityDrafts.some(
      (priority) =>
        Boolean(priority.text.trim()) ||
        priority.priorityType === "linked_key_result" ||
        priority.trackerLinks.some((trackerLink) => Boolean(trackerLink.title.trim() || trackerLink.url.trim())),
    ) ||
    Boolean(challengesComments.trim()) ||
    followUps.some((followUp) => Boolean(followUp.note.trim()) || followUp.status !== "Not completed") ||
    Object.values(objectiveDrafts).some((draft) => {
      return (
        Boolean(draft.status || draft.confidence || draft.note.trim()) ||
        Object.values(draft.keyResults).some((krDraft) =>
          Boolean(krDraft.currentValue.trim() || krDraft.progressPercent.trim() || krDraft.status || krDraft.note.trim()),
        )
      );
    })
  );
}

function deriveSubmitStatus(
  currentReport: WeeklyReport | undefined,
  displayStatus: ReturnType<typeof deriveOkrUpdateStatus>,
  week: { week_start_date: string; week_end_date: string },
  hasDraftActivity: boolean,
): SubmitStatus {
  return deriveWeeklyReminderStatus({
    report: currentReport,
    okrUpdateStatus: displayStatus,
    hasSavedDraft: hasDraftActivity,
    weekEndDate: week.week_end_date,
  });
}

function getReadinessItems({
  activeObjectives,
  displayStatus,
  draftCheckIns,
  followUps,
  priorityDrafts,
  challengesComments,
}: {
  activeObjectives: Objective[];
  displayStatus: ReturnType<typeof deriveOkrUpdateStatus>;
  draftCheckIns: CheckIn[];
  followUps: FollowUpDraft[];
  priorityDrafts: WeeklyPriorityDraft[];
  challengesComments: string;
}) {
  const topPriorityTexts = getTopPriorityTuple(priorityDrafts);

  return [
    {
      label: "Last week follow-up",
      complete: followUps.length === 0 || followUps.every((followUp) => Boolean(followUp.status)),
      detail: followUps.length === 0 ? "No previous priorities to review." : "Each previous priority has a lightweight follow-up status.",
    },
    {
      label: "OKR / KR check-ins",
      complete: activeObjectives.length === 0 || draftCheckIns.length > 0 || displayStatus === "Updated" || displayStatus === "Partially Updated",
      detail:
        activeObjectives.length === 0
          ? "No active OKRs are available this week."
          : "A valid check-in updates KR progress/status, confirms objective status/confidence, or adds progress/risk context.",
    },
    {
      label: "Priority 1",
      complete: Boolean(topPriorityTexts[0].trim()),
      detail: "Priority 1 is required and remains plain text.",
      blocking: true,
    },
    {
      label: "Priorities 2 and 3",
      complete: true,
      detail: "Optional plain-text focus areas for next week.",
    },
    {
      label: "Challenges / support",
      complete: Boolean(challengesComments.trim()),
      detail: "Optional. Add blockers, risks, manager support needed, or broader comments.",
    },
  ];
}

function toNextPriorityTuple(priorityDrafts: WeeklyPriorityDraft[]): [string, string?, string?] {
  const cleaned = getTopPriorityTuple(priorityDrafts).map((priority) => priority.trim()).filter(Boolean);
  return [cleaned[0], cleaned[1], cleaned[2]];
}

function toWeeklyPriorities(priorityDrafts: WeeklyPriorityDraft[]): WeeklyPriority[] {
  return normalizePriorityRanks(priorityDrafts)
    .filter((priority) => priority.text.trim())
    .map((priority) => ({
      id: priority.id.startsWith("draft-weekly-priority-") ? `local-weekly-priority-${crypto.randomUUID()}` : priority.id,
      text: priority.text.trim(),
      priorityRank: priority.priorityRank,
      isTopPriority: priority.isTopPriority,
      linkedKeyResultId: priority.priorityType === "linked_key_result" ? priority.linkedKeyResultId || null : null,
      linkedObjectiveId: priority.priorityType === "linked_key_result" ? priority.linkedObjectiveId || null : null,
      priorityType: priority.priorityType,
      trackerLinks: toPriorityTrackerLinks(priority.trackerLinks),
      followUpStatus: null,
      followUpNote: null,
    }));
}

function toPriorityTrackerLinks(trackerLinks: TrackerLink[]): TrackerLink[] {
  return trackerLinks
    .filter((trackerLink) => trackerLink.title.trim() && trackerLink.url.trim() && isValidTrackerUrl(trackerLink.url))
    .map((trackerLink) => ({
      ...trackerLink,
      id: trackerLink.id.startsWith("draft-priority-tracker-") ? `local-priority-tracker-${crypto.randomUUID()}` : trackerLink.id,
      title: trackerLink.title.trim(),
      url: trackerLink.url.trim(),
    }));
}

function createBlankPriorityDrafts(): WeeklyPriorityDraft[] {
  return [1, 2, 3].map((priorityRank) => createPriorityDraft({ priorityRank, isTopPriority: true }));
}

function createPriorityDraft({
  priorityRank,
  isTopPriority,
  text = "",
  priorityType = "ad_hoc",
  linkedKeyResultId = "",
  linkedObjectiveId = "",
  trackerLinks = [],
  id,
}: Partial<WeeklyPriorityDraft> & { priorityRank: number; isTopPriority: boolean }): WeeklyPriorityDraft {
  return {
    id: id ?? `draft-weekly-priority-${crypto.randomUUID()}`,
    text,
    priorityRank,
    isTopPriority,
    linkedKeyResultId: linkedKeyResultId ?? "",
    linkedObjectiveId: linkedObjectiveId ?? "",
    priorityType,
    trackerLinks,
  };
}

function createPriorityDraftsFromTuple(nextPriorities: [string, string, string] | Array<string | undefined>): WeeklyPriorityDraft[] {
  return [0, 1, 2].map((index) =>
    createPriorityDraft({
      priorityRank: index + 1,
      isTopPriority: true,
      text: nextPriorities[index] ?? "",
    }),
  );
}

function createPriorityDraftsFromReport(report?: WeeklyReport): WeeklyPriorityDraft[] {
  const topDefaults = createPriorityDraftsFromTuple([
    report?.nextWeekPriorities[0] ?? "",
    report?.nextWeekPriorities[1] ?? "",
    report?.nextWeekPriorities[2] ?? "",
  ]);

  if (!report?.weeklyPriorities?.length) {
    return topDefaults;
  }

  const reportDrafts = report.weeklyPriorities
    .sort((a, b) => a.priorityRank - b.priorityRank)
    .map((priority) =>
      createPriorityDraft({
        id: priority.id,
        text: priority.text,
        priorityRank: priority.priorityRank,
        isTopPriority: priority.isTopPriority,
        linkedKeyResultId: priority.linkedKeyResultId ?? "",
        linkedObjectiveId: priority.linkedObjectiveId ?? "",
        priorityType: priority.priorityType,
        trackerLinks: priority.trackerLinks ?? [],
      }),
    );

  const topDrafts = [0, 1, 2].map((index) => {
    return reportDrafts.find((priority) => priority.priorityRank === index + 1) ?? topDefaults[index];
  });
  const additionalDrafts = reportDrafts.filter((priority) => priority.priorityRank > 3 || !priority.isTopPriority);

  return normalizePriorityRanks([...topDrafts, ...additionalDrafts]);
}

function normalizePriorityRanks(priorityDrafts: WeeklyPriorityDraft[]) {
  return priorityDrafts.map((priority, index) => ({
    ...priority,
    priorityRank: index + 1,
    isTopPriority: index < 3,
  }));
}

function getTopPriorityTuple(priorityDrafts: WeeklyPriorityDraft[]): [string, string, string] {
  const topPriorities = normalizePriorityRanks(priorityDrafts).slice(0, 3);
  return [topPriorities[0]?.text ?? "", topPriorities[1]?.text ?? "", topPriorities[2]?.text ?? ""];
}

function getActiveKeyResultOptions(activeObjectives: Objective[], mergedKeyResults: KeyResult[]) {
  return activeObjectives.flatMap((objective) =>
    mergedKeyResults
      .filter((keyResult) => keyResult.objectiveId === objective.id)
      .map((keyResult) => ({ objective, keyResult })),
  );
}

function formatTrackerType(type: TrackerLinkType) {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusTone(status: ReturnType<typeof deriveOkrUpdateStatus>) {
  if (status === "Updated") return "success";
  if (status === "Partially Updated") return "warning";
  if (status === "Not Updated") return "danger";
  return "neutral";
}

function submitStatusTone(status: SubmitStatus) {
  return weeklyReminderStatusTone(status);
}

function formatManagerReviewStatus(status: ManagerReviewStatus) {
  if (status === "not_reviewed") return "Submitted";
  if (status === "needs_follow_up") return "Needs Follow-up";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function managerReviewStatusTone(status: ManagerReviewStatus) {
  if (status === "reviewed") return "success";
  if (status === "commented") return "info";
  if (status === "needs_follow_up") return "warning";
  return "neutral";
}

function formatWeek(start: string, end: string) {
  return `${formatDate(start)} - ${formatDate(end)}`;
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

function clampPercentInput(value: string) {
  if (value === "") return value;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return value;
  return String(Math.max(0, Math.min(100, parsed)));
}

function getDraftPacingKeyResult(keyResult: KeyResult, krDraft: KrDraft): KeyResult {
  const draftCurrentValue = parseOptionalNumber(krDraft.currentValue);
  const draftProgressPercent = parseOptionalNumber(krDraft.progressPercent);
  const nextCurrentValue = draftCurrentValue ?? keyResult.currentValue;
  const nextProgressPercent =
    draftProgressPercent ?? deriveProgressPercentFromCurrentValue(keyResult, nextCurrentValue) ?? keyResult.progressPercent;

  return {
    ...keyResult,
    currentValue: nextCurrentValue,
    progressPercent: clampPercentNumber(nextProgressPercent),
  };
}

function deriveProgressPercentFromCurrentValue(keyResult: KeyResult, currentValue: number | null) {
  if (typeof currentValue !== "number" || typeof keyResult.targetValue !== "number") {
    return null;
  }

  if (keyResult.metricType === "Numeric decrease" && typeof keyResult.startValue === "number" && keyResult.startValue !== keyResult.targetValue) {
    return ((keyResult.startValue - currentValue) / (keyResult.startValue - keyResult.targetValue)) * 100;
  }

  if (keyResult.targetValue === 0) {
    return null;
  }

  return (currentValue / keyResult.targetValue) * 100;
}

function clampPercentNumber(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isOptionalNumber(value: string) {
  return !value.trim() || Number.isFinite(Number(value));
}

function hasLikelyMarkup(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function createEmptyKrDraft(): KrDraft {
  return {
    currentValue: "",
    progressPercent: "",
    status: "",
    note: "",
  };
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
        className="min-h-28 w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-ink-800 outline-none focus:border-dten-blue"
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
