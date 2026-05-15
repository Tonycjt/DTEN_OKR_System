"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import type { PacingStatus, WorkStatus } from "@prisma/client";
import {
  deleteKrAction,
  updateKrFromObjectiveAction,
  type KrDeleteState,
  type KrUpdateFromObjectiveState,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { pacingStatusTone, workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";

type UserOption = { id: string; name: string; email: string };

type KrData = {
  id: string;
  title: string;
  metricName: string | null;
  ownerId: string | null;
  owner: { id: string; name: string; email: string } | null;
  startValue: number;
  currentValue: number;
  targetValue: number;
  progressPercent: number;
  weightPercent: number;
  confidenceScore: number;
  status: WorkStatus;
  pacingStatus: PacingStatus;
  monthlyTargets: { monthIndex: number; title: string | null }[];
};

type Props = {
  krs: KrData[];
  objectiveId: string;
  progressSource: string;
  users: UserOption[];
  canEdit: boolean;
  quarterMonthNames: string[];
  currentMonthIdx: number | null;
  krWeightMessage: string | null;
  krWeightIsValid: boolean;
  krWeightTotal: number;
};

const KR_WORK_STATUSES: WorkStatus[] = [
  "ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETED", "ON_HOLD",
];

// ─── Per-row component ────────────────────────────────────────────────────────

type RowProps = {
  kr: KrData;
  objectiveId: string;
  users: UserOption[];
  quarterMonthNames: string[];
  currentMonthIdx: number | null;
  colCount: number;
};

function KrRowPanel({
  kr,
  objectiveId,
  users,
  quarterMonthNames,
  currentMonthIdx,
  colCount,
}: RowProps) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [capturedFormData, setCapturedFormData] = useState<FormData | null>(null);
  const [, startTransition] = useTransition();

  const [deleteState, deleteFormAction, deleteIsPending] = useActionState<KrDeleteState, FormData>(
    deleteKrAction,
    null,
  );
  const [updateState, updateFormAction, updateIsPending] = useActionState<KrUpdateFromObjectiveState, FormData>(
    updateKrFromObjectiveAction,
    null,
  );

  const isConfirming = updateState?.step === "confirm" && capturedFormData !== null;

  const monthlyTargetCell = currentMonthIdx
    ? (() => {
        const t = kr.monthlyTargets.find((m) => m.monthIndex === currentMonthIdx);
        return `${quarterMonthNames[currentMonthIdx - 1]}: ${t?.title ?? "—"}`;
      })()
    : kr.monthlyTargets.length > 0
      ? kr.monthlyTargets
          .map((t) => `${quarterMonthNames[t.monthIndex - 1]}: ${t.title ?? "–"}`)
          .join(" / ")
      : "—";

  function handleEditToggle() {
    setEditing((v) => !v);
    setDeleting(false);
    setCapturedFormData(null);
  }

  function handleDeleteToggle() {
    setDeleting((v) => !v);
    setEditing(false);
    setCapturedFormData(null);
  }

  function handleEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    setCapturedFormData(new FormData(e.currentTarget));
    // form submits normally via its action
  }

  function handleConfirmChanges() {
    if (!capturedFormData) return;
    const fd = new FormData();
    capturedFormData.forEach((value, key) => fd.append(key, value as string));
    fd.set("confirmed", "true");
    setCapturedFormData(null);
    startTransition(() => {
      updateFormAction(fd);
    });
  }

  function handleCancelConfirm() {
    setCapturedFormData(null);
  }

  const updateErrors = updateState?.step === "errors" ? updateState.errors : {};

  return (
    <>
      {/* Main KR row */}
      <tr>
        <td>
          <Link href={`/key-results/${kr.id}`}>
            <strong>{kr.title}</strong>
          </Link>
          <br />
          <span className="muted">{kr.metricName ?? "No metric label"}</span>
        </td>
        <td>{kr.owner?.name ?? <span className="muted">—</span>}</td>
        <td>
          <Badge tone={workStatusTone(kr.status)}>{formatEnumLabel(kr.status)}</Badge>
        </td>
        <td>
          <Badge tone={pacingStatusTone(kr.pacingStatus)}>{formatEnumLabel(kr.pacingStatus)}</Badge>
        </td>
        <td>{kr.confidenceScore}/5</td>
        <td>{kr.weightPercent}%</td>
        <td>
          <div className="stack">
            <span>{kr.currentValue} / {kr.targetValue}</span>
            <ProgressBar value={kr.progressPercent} />
          </div>
        </td>
        <td className="muted">{monthlyTargetCell}</td>
        {colCount === 9 ? (
          <td>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleEditToggle}
              >
                {editing ? "Close" : "Edit"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--danger)" }}
                onClick={handleDeleteToggle}
              >
                {deleting ? "Cancel" : "Delete"}
              </button>
            </div>
          </td>
        ) : null}
      </tr>

      {/* Delete confirmation panel */}
      {deleting ? (
        <tr>
          <td colSpan={colCount} style={{ padding: "0" }}>
            <div
              className="notice notice-danger"
              style={{ margin: "0", borderRadius: "0", borderLeft: "4px solid var(--danger)" }}
            >
              {deleteState?.error ? (
                <p style={{ margin: "0 0 10px", fontWeight: 700 }}>{deleteState.error}</p>
              ) : null}
              <p style={{ margin: "0 0 8px" }}>
                <strong>Delete &ldquo;{kr.title}&rdquo;?</strong> This cannot be undone.
              </p>
              <p style={{ margin: "0 0 8px", fontSize: "0.88rem" }}>
                The following user will be notified:
              </p>
              <ul style={{ margin: "0 0 12px", paddingLeft: "18px", fontSize: "0.88rem" }}>
                {kr.owner ? (
                  <li>
                    <strong>{kr.owner.name}</strong> ({kr.owner.email})
                    {" — KR owner"}
                  </li>
                ) : (
                  <li className="muted">No owner assigned</li>
                )}
              </ul>
              <p style={{ margin: "0 0 12px", fontSize: "0.82rem", color: "var(--muted)" }}>
                Any users with check-ins or comments on this KR will also be notified.
              </p>
              <form action={deleteFormAction} style={{ display: "inline" }}>
                <input type="hidden" name="keyResultId" value={kr.id} />
                <input type="hidden" name="objectiveId" value={objectiveId} />
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleDeleteToggle}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-sm"
                    disabled={deleteIsPending}
                    style={{ background: "var(--danger)", color: "#fff", border: "none" }}
                  >
                    {deleteIsPending ? "Deleting…" : "Confirm Delete"}
                  </button>
                </div>
              </form>
            </div>
          </td>
        </tr>
      ) : null}

      {/* Edit panel */}
      {editing ? (
        <tr>
          <td colSpan={colCount} style={{ padding: "0" }}>
            <div
              style={{
                background: "var(--surface-muted)",
                borderTop: "1px solid var(--border)",
                padding: "16px",
              }}
            >
              {/* Impact confirmation banner */}
              {isConfirming && updateState?.step === "confirm" ? (
                <div className="notice notice-danger" style={{ marginBottom: "14px" }}>
                  <p style={{ margin: "0 0 8px", fontWeight: 700 }}>Confirm impact</p>
                  <ul style={{ margin: "0 0 10px", paddingLeft: "18px", fontSize: "0.88rem" }}>
                    {updateState.changes.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                  <p style={{ margin: "0 0 8px", fontSize: "0.88rem" }}>
                    <strong>The following users will be notified:</strong>
                  </p>
                  <ul style={{ margin: "0 0 12px", paddingLeft: "18px", fontSize: "0.88rem" }}>
                    {updateState.impactedUsers.map((u) => (
                      <li key={u.id}>
                        <strong>{u.name}</strong> ({u.email}){u.title ? ` — ${u.title}` : ""}
                      </li>
                    ))}
                  </ul>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleCancelConfirm}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={updateIsPending}
                      style={{ background: "var(--danger)", color: "#fff", border: "none" }}
                      onClick={handleConfirmChanges}
                    >
                      {updateIsPending ? "Saving…" : "Confirm Changes"}
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Edit form — always rendered so input values persist through confirmation */}
              <form
                action={updateFormAction}
                className="form-grid"
                onSubmit={handleEditSubmit}
              >
                <input type="hidden" name="keyResultId" value={kr.id} />
                <input type="hidden" name="objectiveId" value={objectiveId} />

                <label className="field wide">
                  <span>Title</span>
                  <input defaultValue={kr.title} name="title" required />
                  {updateErrors.title ? (
                    <span className="field-error">{updateErrors.title}</span>
                  ) : null}
                </label>

                <label className="field wide">
                  <span>Metric label</span>
                  <input defaultValue={kr.metricName ?? ""} name="metricName" placeholder="e.g. Readiness percent" />
                </label>

                <label className="field">
                  <span>Owner</span>
                  <select defaultValue={kr.ownerId ?? ""} name="ownerId">
                    <option value="">No owner (assign later)</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  {updateErrors.ownerId ? (
                    <span className="field-error">{updateErrors.ownerId}</span>
                  ) : null}
                </label>

                <label className="field">
                  <span>Status</span>
                  <select defaultValue={kr.status} name="status" required>
                    {KR_WORK_STATUSES.map((s) => (
                      <option key={s} value={s}>{formatEnumLabel(s)}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Start</span>
                  <input defaultValue={kr.startValue} name="startValue" type="number" />
                </label>

                <label className="field">
                  <span>Current</span>
                  <input defaultValue={kr.currentValue} name="currentValue" type="number" />
                </label>

                <label className="field">
                  <span>Target</span>
                  <input defaultValue={kr.targetValue} name="targetValue" type="number" />
                </label>

                <label className="field">
                  <span>Confidence (1–5)</span>
                  <input
                    defaultValue={kr.confidenceScore}
                    max="5"
                    min="1"
                    name="confidenceScore"
                    type="number"
                  />
                </label>

                <label className="field">
                  <span>Weight %</span>
                  <input
                    defaultValue={kr.weightPercent}
                    max="100"
                    min="0"
                    name="weightPercent"
                    type="number"
                  />
                  {updateErrors.weightPercent ? (
                    <span className="field-error">{updateErrors.weightPercent}</span>
                  ) : null}
                </label>

                {updateErrors.general ? (
                  <div className="wide">
                    <div className="notice notice-danger">{updateErrors.general}</div>
                  </div>
                ) : null}

                <div className="wide form-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleEditToggle}
                  >
                    Discard
                  </button>
                  <Button
                    type="submit"
                    disabled={updateIsPending || isConfirming}
                  >
                    {updateIsPending ? "Saving…" : "Save Changes"}
                  </Button>
                </div>
              </form>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

// ─── Main section export ──────────────────────────────────────────────────────

export function KrManagementSection({
  krs,
  objectiveId,
  progressSource,
  users,
  canEdit,
  quarterMonthNames,
  currentMonthIdx,
  krWeightMessage,
  krWeightIsValid,
  krWeightTotal,
}: Props) {
  const colCount = canEdit ? 9 : 8;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Key Results</h2>
        <p>
          {krs.length} KRs linked. KR weights total {krWeightTotal}%.
        </p>
      </div>
      <div className="card-content">
        {krWeightMessage ? (
          <div className={`notice ${krWeightIsValid ? "" : "notice-danger"}`}>{krWeightMessage}</div>
        ) : progressSource === "DIRECT_KRS" && krs.length > 0 ? (
          <div className="notice">KR weights are balanced at 100%.</div>
        ) : (
          <div className="notice">KR weights are optional for manual-progress objectives.</div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Key Result</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Pacing</th>
                <th>Confidence</th>
                <th>Weight</th>
                <th>Progress</th>
                <th>Monthly Target</th>
                {canEdit ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {krs.map((kr) => (
                <KrRowPanel
                  key={kr.id}
                  kr={kr}
                  objectiveId={objectiveId}
                  users={users}
                  quarterMonthNames={quarterMonthNames}
                  currentMonthIdx={currentMonthIdx}
                  colCount={colCount}
                />
              ))}
              {krs.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="muted">
                    No KRs yet. Add one above.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
