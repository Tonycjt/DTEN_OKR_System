"use client";

import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { deriveKRPacingStatus, getCurrentMonthlyTarget } from "@/lib/kr-monthly-checkpoints";
import { mockCurrentDate } from "@/lib/mock-current-date";
import { isValidTrackerUrl } from "@/lib/tracker-link-helpers";
import type { KRPacingStatus, KeyResult, MonthlyTarget, TrackerLink, TrackerLinkType } from "@/types";

export function KRPacingBadge({ keyResult }: { keyResult: KeyResult }) {
  const pacingStatus = deriveKRPacingStatus(keyResult, mockCurrentDate);

  return <Badge tone={pacingTone(pacingStatus)}>{pacingStatus}</Badge>;
}

export function KRMonthlyPacingSummary({ keyResult }: { keyResult: KeyResult }) {
  const currentTarget = getCurrentMonthlyTarget(keyResult, mockCurrentDate);
  const pacingStatus = deriveKRPacingStatus(keyResult, mockCurrentDate);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <KRPacingBadge keyResult={keyResult} />
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">
          Current monthly target: {currentTarget ? formatMonthlyTarget(keyResult, currentTarget) : "Not set"}
        </span>
      </div>
      {pacingStatus === "Behind" ? (
        <p className="text-xs font-semibold text-dten-amber">Behind current monthly checkpoint — review progress during weekly update.</p>
      ) : null}
    </div>
  );
}

export function KRMonthlyTargetsDetail({ keyResult }: { keyResult: KeyResult }) {
  const monthlyTargets = keyResult.monthlyTargets ?? [];
  const currentTarget = getCurrentMonthlyTarget(keyResult, mockCurrentDate);

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-ink-950">Monthly Targets</h4>
          <p className="mt-1 text-xs leading-5 text-ink-600">Monthly pacing is a visibility signal only. It does not change quarterly score, status, or confidence.</p>
        </div>
        <KRPacingBadge keyResult={keyResult} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <DetailMetric label="Quarter target" value={formatMetricValue(keyResult.targetValue)} />
        <DetailMetric
          label="Current progress vs monthly target"
          value={currentTarget ? `${keyResult.progressPercent}% / ${getTargetProgressPercent(keyResult, currentTarget)}%` : "No monthly target set"}
        />
      </div>

      {monthlyTargets.length === 0 ? (
        <p className="mt-3 text-sm text-ink-600">No monthly checkpoints are set for this Key Result.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {monthlyTargets.map((target) => {
            const isCurrent = currentTarget?.monthLabel === target.monthLabel;

            return (
              <div
                key={`${keyResult.id}-${target.monthLabel}`}
                className={`rounded-md border p-3 ${
                  isCurrent ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink-950">{target.monthLabel}</p>
                    {isCurrent ? <Badge tone="info">Current month</Badge> : null}
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">
                    Target {formatMonthlyTarget(keyResult, target)}
                  </p>
                </div>
                <div className="mt-3">
                  <ProgressBar value={getTargetProgressPercent(keyResult, target)} label={`${target.monthLabel} target progress`} />
                </div>
                {target.notes ? <p className="mt-2 text-xs leading-5 text-ink-600">{target.notes}</p> : null}
              </div>
            );
          })}
        </div>
      )}

      {deriveKRPacingStatus(keyResult, mockCurrentDate) === "Behind" ? (
        <p className="mt-3 text-sm font-semibold text-dten-amber">Behind current monthly checkpoint — review progress during weekly update.</p>
      ) : null}
    </div>
  );
}

const trackerLinkTypes: TrackerLinkType[] = ["google_doc", "google_sheet", "crm_report", "dashboard", "other"];

export function KRTrackerLinks({
  keyResult,
  canEdit = false,
  onChange,
  currentUserId,
}: {
  keyResult: KeyResult;
  canEdit?: boolean;
  onChange?: (trackerLinks: TrackerLink[]) => void;
  currentUserId?: string;
}) {
  const trackerLinks = keyResult.trackerLinks ?? [];
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<TrackerLinkType>("google_doc");
  const [error, setError] = useState<string | null>(null);

  function addTrackerLink() {
    setError(null);
    const trimmedTitle = title.trim();
    const trimmedUrl = url.trim();

    if (!trimmedTitle || !trimmedUrl) {
      setError("Tracker link title and URL are required.");
      return;
    }

    if (!isValidTrackerUrl(trimmedUrl)) {
      setError("Enter a valid http or https URL.");
      return;
    }

    onChange?.([
      ...trackerLinks,
      {
        id: `local-tracker-${crypto.randomUUID()}`,
        title: trimmedTitle,
        url: trimmedUrl,
        type,
        addedByUserId: currentUserId ?? "mock-user",
        addedAt: new Date().toISOString(),
      },
    ]);
    setTitle("");
    setUrl("");
    setType("google_doc");
  }

  function removeTrackerLink(trackerLinkId: string) {
    onChange?.(trackerLinks.filter((trackerLink) => trackerLink.id !== trackerLinkId));
  }

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink-950">Tracker Links</h4>
        <Badge tone="neutral">{trackerLinks.length}</Badge>
      </div>
      {trackerLinks.length === 0 ? (
        <p className="mt-2 text-sm text-ink-600">No tracker links added for this Key Result.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {trackerLinks.map((trackerLink) => (
            <div key={trackerLink.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <a
                href={trackerLink.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 transition hover:text-dten-blue"
              >
                <span className="block font-semibold text-ink-950">{trackerLink.title}</span>
                <span className="mt-1 inline-flex">
                  <TrackerTypeBadge trackerLink={trackerLink} />
                </span>
              </a>
              <div className="flex items-center gap-2">
                <a
                  href={trackerLink.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-dten-blue"
                >
                  Open
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => removeTrackerLink(trackerLink.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-ink-600 hover:bg-slate-100"
                    aria-label={`Remove tracker link ${trackerLink.title}`}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
      {canEdit ? (
        <div className="mt-4 rounded-md border border-blue-100 bg-blue-50/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Add tracker link</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">Link title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-ink-800 outline-none focus:border-dten-blue"
                placeholder="Evidence tracker"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">Type</span>
              <select
                value={type}
                onChange={(event) => setType(event.target.value as TrackerLinkType)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-ink-800 outline-none focus:border-dten-blue"
              >
                {trackerLinkTypes.map((trackerLinkType) => (
                  <option key={trackerLinkType} value={trackerLinkType}>
                    {formatTrackerType(trackerLinkType)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">URL</span>
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-ink-800 outline-none focus:border-dten-blue"
                placeholder="https://docs.google.com/..."
              />
            </label>
          </div>
          {error ? <p className="mt-2 text-sm font-semibold text-dten-red">{error}</p> : null}
          <button
            type="button"
            onClick={addTrackerLink}
            className="mt-3 inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-dten-blue bg-dten-blue px-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Plus size={14} aria-hidden="true" />
            Add link
          </button>
        </div>
      ) : null}
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink-950">{value}</p>
    </div>
  );
}

function pacingTone(status: KRPacingStatus) {
  if (status === "Ahead") return "success";
  if (status === "On Pace") return "info";
  if (status === "Behind") return "warning";
  return "neutral";
}

function TrackerTypeBadge({ trackerLink }: { trackerLink: TrackerLink }) {
  return <Badge tone="info">{formatTrackerType(trackerLink.type)}</Badge>;
}

function formatTrackerType(type: TrackerLink["type"]) {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMonthlyTarget(keyResult: KeyResult, target: MonthlyTarget) {
  return `${formatMetricValue(target.targetValue)} (${getTargetProgressPercent(keyResult, target)}%)`;
}

function getTargetProgressPercent(keyResult: KeyResult, target: MonthlyTarget) {
  if (typeof target.targetProgressPercent === "number") {
    return clampPercent(target.targetProgressPercent);
  }

  if (typeof keyResult.targetValue === "number" && keyResult.targetValue !== 0) {
    return clampPercent((target.targetValue / keyResult.targetValue) * 100);
  }

  return clampPercent(target.targetValue);
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatMetricValue(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "Not set";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
