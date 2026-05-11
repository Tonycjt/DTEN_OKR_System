"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  loadLocalOkrStore,
  replaceLocalKeyResults,
  saveLocalOkrStore,
  upsertLocalCheckIn,
  upsertLocalObjective,
} from "@/lib/local-okr-store";
import { useMockSessionUser } from "@/lib/mock-session";
import type { CheckIn, Confidence, KeyResult, KeyResultStatus, Objective, ObjectiveStatus } from "@/types";

type OkrProgressUpdateModalProps = {
  objective: Objective;
  keyResults: KeyResult[];
  onClose: () => void;
  onSaved?: () => void;
};

type KrDraft = {
  currentValue: string;
  progressPercent: string;
  status: KeyResultStatus;
  note: string;
};

const objectiveStatuses: ObjectiveStatus[] = ["Active", "At Risk", "Off Track", "Completed", "On Hold"];
const confidenceOptions: Confidence[] = ["High", "Medium", "Low"];
const keyResultStatuses: KeyResultStatus[] = ["Not Started", "On Track", "At Risk", "Off Track", "Completed"];

export function OkrProgressUpdateModal({ objective, keyResults, onClose, onSaved }: OkrProgressUpdateModalProps) {
  const activeUser = useMockSessionUser();
  const [objectiveStatus, setObjectiveStatus] = useState<ObjectiveStatus>(objective.status);
  const [confidence, setConfidence] = useState<Confidence>(objective.confidence);
  const [summaryNote, setSummaryNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [krDrafts, setKrDrafts] = useState<Record<string, KrDraft>>(() => {
    return Object.fromEntries(
      keyResults.map((keyResult) => [
        keyResult.id,
        {
          currentValue: keyResult.currentValue?.toString() ?? "",
          progressPercent: keyResult.progressPercent.toString(),
          status: keyResult.status,
          note: "",
        },
      ]),
    );
  });
  const projectedScore = useMemo(() => {
    if (keyResults.length === 0) return objective.score;
    const total = keyResults.reduce((sum, keyResult) => {
      return sum + parseProgress(krDrafts[keyResult.id]?.progressPercent, keyResult.progressPercent);
    }, 0);
    return Math.round(total / keyResults.length);
  }, [keyResults, krDrafts, objective.score]);

  function updateKrDraft(keyResultId: string, updates: Partial<KrDraft>) {
    setKrDrafts((drafts) => ({
      ...drafts,
      [keyResultId]: {
        ...drafts[keyResultId],
        ...updates,
      },
    }));
  }

  function saveUpdate() {
    setMessage(null);

    const invalidProgress = keyResults.find((keyResult) => {
      const value = krDrafts[keyResult.id]?.progressPercent ?? "";
      return value.trim() !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100);
    });

    const invalidCurrentValue = keyResults.find((keyResult) => {
      const value = krDrafts[keyResult.id]?.currentValue ?? "";
      return value.trim() !== "" && !Number.isFinite(Number(value));
    });

    if (invalidProgress) {
      setMessage("KR progress percent must be a number from 0 to 100.");
      return;
    }

    if (invalidCurrentValue) {
      setMessage("KR current value must be a valid number.");
      return;
    }

    const timestamp = new Date().toISOString();
    const checkInDate = timestamp.slice(0, 10);
    const nextKeyResults = keyResults.map((keyResult) => {
      const draft = krDrafts[keyResult.id];
      if (!draft || keyResult.linkedChildObjectiveId) return keyResult;

      return {
        ...keyResult,
        currentValue: parseOptionalNumber(draft.currentValue),
        progressPercent: parseProgress(draft.progressPercent, keyResult.progressPercent),
        status: draft.status,
      };
    });
    const nextObjective: Objective = {
      ...objective,
      status: objectiveStatus,
      confidence,
      score: projectedScore,
      updatedByUserId: activeUser.id,
      updatedAt: timestamp,
    };

    let nextStore = upsertLocalObjective(loadLocalOkrStore(), nextObjective);
    nextStore = replaceLocalKeyResults(nextStore, objective.id, nextKeyResults);

    const objectiveCheckIn: CheckIn = {
      id: `local-checkin-${activeUser.id}-${checkInDate}-${objective.id}-manual-objective`,
      resourceType: "objective",
      objectiveId: objective.id,
      keyResultId: null,
      checkInDate,
      progressUpdate: summaryNote.trim(),
      objectiveStatus,
      keyResultStatus: null,
      confidence,
      progressPercent: null,
      currentValue: null,
      notes: summaryNote.trim() || null,
      createdByUserId: activeUser.id,
      createdAt: timestamp,
    };
    nextStore = upsertLocalCheckIn(nextStore, objectiveCheckIn);

    nextKeyResults.forEach((keyResult) => {
      const draft = krDrafts[keyResult.id];
      if (!draft || keyResult.linkedChildObjectiveId) return;

      const checkIn: CheckIn = {
        id: `local-checkin-${activeUser.id}-${checkInDate}-${keyResult.id}-manual`,
        resourceType: "key_result",
        objectiveId: objective.id,
        keyResultId: keyResult.id,
        checkInDate,
        progressUpdate: draft.note.trim(),
        objectiveStatus: null,
        keyResultStatus: draft.status,
        confidence: null,
        progressPercent: keyResult.progressPercent,
        currentValue: keyResult.currentValue,
        notes: draft.note.trim() || null,
        createdByUserId: activeUser.id,
        createdAt: timestamp,
      };
      nextStore = upsertLocalCheckIn(nextStore, checkIn);
    });

    saveLocalOkrStore(nextStore);
    onSaved?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-950/30 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-5">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="info">Update progress</Badge>
              <Badge tone="neutral">Manual update</Badge>
            </div>
            <h2 className="mt-3 text-lg font-semibold text-ink-950">{objective.title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              Score = progress. Status = execution health. Confidence = owner judgment.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-ink-600 hover:bg-slate-50"
            aria-label="Close update progress"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {message ? <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-dten-red">{message}</div> : null}

          <section className="rounded-lg border border-slate-200 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink-950">Objective update</h3>
                <p className="mt-1 text-sm text-ink-600">Keep status and confidence separate from score.</p>
              </div>
              <div className="w-full lg:w-56">
                <ProgressBar value={projectedScore} label="Projected score" />
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <SelectField label="Objective status" value={objectiveStatus} onChange={(value) => setObjectiveStatus(value as ObjectiveStatus)}>
                {objectiveStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </SelectField>
              <SelectField label="Confidence" value={confidence} onChange={(value) => setConfidence(value as Confidence)}>
                {confidenceOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </SelectField>
              <TextField label="Optional summary note" value={summaryNote} onChange={setSummaryNote} placeholder="What changed, risk, or no-change context." />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-ink-950">Key Result updates</h3>
            {keyResults.map((keyResult) => {
              const draft = krDrafts[keyResult.id];
              const readOnly = Boolean(keyResult.linkedChildObjectiveId);

              return (
                <div key={keyResult.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="info">KR</Badge>
                        <StatusBadge status={keyResult.status} />
                        <Badge tone="neutral">{keyResult.metricType}</Badge>
                        {readOnly ? <Badge tone="info">Auto-updated</Badge> : null}
                      </div>
                      <p className="mt-2 text-sm font-semibold leading-6 text-ink-950">{keyResult.title}</p>
                    </div>
                    <div className="w-full lg:w-48">
                      <ProgressBar value={parseProgress(draft?.progressPercent, keyResult.progressPercent)} label="KR progress" />
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-4">
                    <TextField
                      label="Current value"
                      type="number"
                      value={draft?.currentValue ?? ""}
                      onChange={(value) => updateKrDraft(keyResult.id, { currentValue: value })}
                      disabled={readOnly}
                    />
                    <TextField
                      label="Progress percent"
                      type="number"
                      value={draft?.progressPercent ?? ""}
                      onChange={(value) => updateKrDraft(keyResult.id, { progressPercent: clampPercentInput(value) })}
                      disabled={readOnly}
                    />
                    <SelectField
                      label="KR status"
                      value={draft?.status ?? keyResult.status}
                      onChange={(value) => updateKrDraft(keyResult.id, { status: value as KeyResultStatus })}
                      disabled={readOnly}
                    >
                      {keyResultStatuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </SelectField>
                    <TextField
                      label="Optional note"
                      value={draft?.note ?? ""}
                      onChange={(value) => updateKrDraft(keyResult.id, { note: value })}
                      placeholder="Short progress note."
                    />
                  </div>
                </div>
              );
            })}
          </section>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-ink-800 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveUpdate}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-dten-blue bg-dten-blue px-4 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Save progress update
            </button>
          </div>
        </div>
      </div>
    </div>
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

function parseOptionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseProgress(value: string | undefined, fallback: number) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function clampPercentInput(value: string) {
  if (value === "") return value;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return value;
  return String(Math.max(0, Math.min(100, parsed)));
}
