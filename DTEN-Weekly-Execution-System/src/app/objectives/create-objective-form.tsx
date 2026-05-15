"use client";

import { useActionState, useState } from "react";
import { createObjectiveAction } from "./actions";
import { Button } from "@/components/ui/button";
import { formatEnumLabel } from "@/lib/format";

type User = { id: string; name: string; role: string };

type Props = {
  currentUserId: string;
  assignableUsers: User[];
  inferredLevel: string;
  inferredOrgLabel: string | null;
  missingOrgContext: boolean;
};

const PROGRESS_SOURCES = ["DIRECT_KRS", "MANUAL"] as const;

export function CreateObjectiveForm({
  currentUserId,
  assignableUsers,
  inferredLevel,
  inferredOrgLabel,
  missingOrgContext,
}: Props) {
  const [state, formAction] = useActionState(createObjectiveAction, null);
  const [krRows, setKrRows] = useState<number[]>([]);
  const [nextId, setNextId] = useState(0);

  const errors = state?.errors ?? {};

  function addKrRow() {
    setKrRows((rows) => [...rows, nextId]);
    setNextId((n) => n + 1);
  }

  function removeKrRow(uid: number) {
    setKrRows((rows) => rows.filter((r) => r !== uid));
  }

  const levelDisplay = [formatEnumLabel(inferredLevel), inferredOrgLabel].filter(Boolean).join(" · ");

  return (
    <form action={formAction} className="stack">
      {missingOrgContext ? (
        <div className="notice notice-danger">
          Your profile is missing required organisation context (department or team).
          Ask an admin to update your profile before creating objectives.
        </div>
      ) : null}

      {/* ── Objective Details ──────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2>Objective Details</h2>
          <p>Objectives are parallel items. Status is assigned automatically — just fill the details.</p>
        </div>
        <div className="card-content">
          <div className="form-grid">
            <label className="field wide">
              <span>Title</span>
              <input name="title" placeholder="Improve customer onboarding quality" required />
              {errors.title ? <span className="field-error">{errors.title}</span> : null}
            </label>

            <label className="field wide">
              <span>Description</span>
              <textarea name="description" placeholder="Describe the intended outcome" />
            </label>

            <div className="field">
              <span>Level</span>
              <p className="muted" style={{ margin: 0, paddingTop: "6px", fontSize: "0.92rem" }}>
                {levelDisplay}
                <span style={{ opacity: 0.55, marginLeft: "6px" }}>— inferred from your role</span>
              </p>
            </div>

            <label className="field">
              <span>Progress Source</span>
              <select defaultValue="DIRECT_KRS" name="progressSource" required>
                {PROGRESS_SOURCES.map((src) => (
                  <option key={src} value={src}>{formatEnumLabel(src)}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Quarter</span>
              <input defaultValue="2026-Q2" name="quarter" placeholder="2026-Q2" required />
              {errors.quarter ? <span className="field-error">{errors.quarter}</span> : null}
            </label>

            <label className="field">
              <span>Owner</span>
              <select defaultValue={currentUserId} name="ownerId" required>
                {assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({formatEnumLabel(u.role)})</option>
                ))}
              </select>
              {errors.ownerId ? <span className="field-error">{errors.ownerId}</span> : null}
            </label>

            <label className="field">
              <span>Confidence (1–5)</span>
              <input defaultValue="3" max="5" min="1" name="confidenceScore" type="number" />
            </label>
          </div>
        </div>
      </div>

      {/* ── Key Results (optional) ─────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2>Key Results <span className="muted" style={{ fontWeight: 400 }}>(optional — add now or after saving)</span></h2>
          <p>For Direct KR objectives, KR weights must total 100% before publishing.</p>
        </div>
        <div className="card-content">
          <input type="hidden" name="krCount" value={krRows.length} />

          {errors.krs ? <div className="notice notice-danger" style={{ marginBottom: "12px" }}>{errors.krs}</div> : null}

          {krRows.length === 0 ? (
            <p className="muted">No KRs added yet. Click below to add one.</p>
          ) : (
            <div className="stack">
              {krRows.map((uid, i) => (
                <div key={uid} className="kr-row-editor">
                  <div className="kr-row-header">
                    <strong>KR {i + 1}</strong>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => removeKrRow(uid)}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="form-grid">
                    <label className="field wide">
                      <span>Title</span>
                      <input name={`krTitle_${i}`} placeholder="Increase release readiness to 90%" />
                    </label>
                    <label className="field">
                      <span>Owner</span>
                      <select name={`krOwnerId_${i}`}>
                        <option value="">No owner (assign later)</option>
                        {assignableUsers.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Start Value</span>
                      <input defaultValue="0" name={`krStart_${i}`} type="number" />
                    </label>
                    <label className="field">
                      <span>Target Value</span>
                      <input defaultValue="100" name={`krTarget_${i}`} type="number" />
                    </label>
                    <label className="field">
                      <span>Weight %</span>
                      <input defaultValue="0" max="100" min="0" name={`krWeight_${i}`} type="number" />
                    </label>
                    <label className="field">
                      <span>Confidence (1–5)</span>
                      <input defaultValue="3" max="5" min="1" name={`krConfidence_${i}`} type="number" />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: "12px" }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addKrRow}>
              + Add Key Result
            </button>
          </div>
        </div>
      </div>

      {/* ── General error ──────────────────────────────────────── */}
      {errors.general ? <div className="notice notice-danger">{errors.general}</div> : null}

      {/* ── Actions ───────────────────────────────────────────── */}
      <div className="form-actions">
        <button
          type="submit"
          name="intent"
          value="save"
          className="btn btn-secondary"
          disabled={missingOrgContext}
        >
          Save for Later
        </button>
        <Button type="submit" name="intent" value="publish" disabled={missingOrgContext}>
          Publish Objective
        </Button>
      </div>
    </form>
  );
}
