"use client";

import { useActionState } from "react";
import { updateObjectiveAction } from "./actions";
import { Button } from "@/components/ui/button";
import { formatEnumLabel } from "@/lib/format";

type User = { id: string; name: string };
type Department = { id: string; name: string };
type Team = { id: string; name: string; department: { name: string } };

export type EditableObjective = {
  id: string;
  title: string;
  description: string | null;
  level: string;
  status: string;
  quarter: string;
  progressSource: string;
  progressPercent: number;
  confidenceScore: number;
  ownerId: string;
  departmentId: string | null;
  teamId: string | null;
};

type Props = {
  objective: EditableObjective;
  users: User[];
  departments: Department[];
  teams: Team[];
};

const LEVELS = ["COMPANY", "DEPARTMENT", "TEAM", "INDIVIDUAL"] as const;
const PROGRESS_SOURCES = ["DIRECT_KRS", "MANUAL"] as const;
const PUBLISHED_STATUSES = ["ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETED", "ON_HOLD"] as const;

export function EditObjectiveForm({ objective, users, departments, teams }: Props) {
  const [state, formAction] = useActionState(updateObjectiveAction, null);
  const errors = state?.errors ?? {};
  const isDraft = objective.status === "DRAFT";

  return (
    <form action={formAction} className="stack">
      <input type="hidden" name="objectiveId" value={objective.id} />

      <div className="card">
        <div className="card-header">
          <h2>{isDraft ? "Edit Draft Objective" : "Edit Objective"}</h2>
          <p>
            {isDraft
              ? "Save for Later keeps it as a draft. Publish validates and activates it."
              : "Update fields below. Status can be changed without republishing."}
          </p>
        </div>
        <div className="card-content">
          <div className="form-grid">
            <label className="field wide">
              <span>Title</span>
              <input defaultValue={objective.title} name="title" required />
              {errors.title ? <span className="field-error">{errors.title}</span> : null}
            </label>

            <label className="field wide">
              <span>Description</span>
              <textarea defaultValue={objective.description ?? ""} name="description" />
            </label>

            <label className="field">
              <span>Level</span>
              <select defaultValue={objective.level} name="level" required>
                {LEVELS.map((level) => (
                  <option key={level} value={level}>{formatEnumLabel(level)}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Progress Source</span>
              <select defaultValue={objective.progressSource} name="progressSource" required>
                {PROGRESS_SOURCES.map((src) => (
                  <option key={src} value={src}>{formatEnumLabel(src)}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Quarter</span>
              <input defaultValue={objective.quarter} name="quarter" required />
              {errors.quarter ? <span className="field-error">{errors.quarter}</span> : null}
            </label>

            <label className="field">
              <span>Owner</span>
              <select defaultValue={objective.ownerId} name="ownerId" required>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              {errors.ownerId ? <span className="field-error">{errors.ownerId}</span> : null}
            </label>

            <label className="field">
              <span>Department</span>
              <select defaultValue={objective.departmentId ?? ""} name="departmentId">
                <option value="">None</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Team</span>
              <select defaultValue={objective.teamId ?? ""} name="teamId">
                <option value="">None</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.department.name} / {t.name}</option>
                ))}
              </select>
            </label>

            {!isDraft ? (
              <label className="field">
                <span>Status</span>
                <select defaultValue={objective.status} name="status" required>
                  {PUBLISHED_STATUSES.map((s) => (
                    <option key={s} value={s}>{formatEnumLabel(s)}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {!isDraft ? (
              <label className="field">
                <span>Progress %</span>
                <input
                  defaultValue={objective.progressPercent}
                  max="100"
                  min="0"
                  name="progressPercent"
                  type="number"
                />
                {objective.progressSource !== "MANUAL" ? (
                  <small className="muted">Auto-calculated from KRs. Editable only for Manual source.</small>
                ) : null}
              </label>
            ) : null}

            <label className="field">
              <span>Confidence (1–5)</span>
              <input defaultValue={objective.confidenceScore} max="5" min="1" name="confidenceScore" type="number" />
            </label>
          </div>
        </div>
      </div>

      {errors.krs ? (
        <div className="notice notice-danger">{errors.krs}</div>
      ) : null}

      {errors.general ? (
        <div className="notice notice-danger">{errors.general}</div>
      ) : null}

      <div className="form-actions">
        {isDraft ? (
          <>
            <button type="submit" name="intent" value="save" className="btn btn-secondary">
              Save for Later
            </button>
            <Button type="submit" name="intent" value="publish">
              Publish Objective
            </Button>
          </>
        ) : (
          <Button type="submit" name="intent" value="update">
            Update Objective
          </Button>
        )}
      </div>
    </form>
  );
}
