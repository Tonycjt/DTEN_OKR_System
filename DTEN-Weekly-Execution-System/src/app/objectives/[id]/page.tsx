import Link from "next/link";
import type { ObjectiveLevel, ObjectiveProgressSource, WorkStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import {
  createKeyResultAction,
  updateObjectiveAction,
} from "@/app/objectives/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { pacingStatusTone, workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { calculateObjectiveHealth, getObjectiveChildStatuses } from "@/lib/objective-health";
import { validateObjectiveKrWeights } from "@/lib/rollup-validation";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

type ObjectiveDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    error?: string | string[];
  }>;
};

const workStatuses: WorkStatus[] = ["DRAFT", "ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETED", "ON_HOLD"];
const objectiveLevels: ObjectiveLevel[] = ["COMPANY", "DEPARTMENT", "TEAM", "INDIVIDUAL"];
// R3.4: CHILD_OBJECTIVES removed from active UI; data remains for compatibility
const objectiveProgressSources: ObjectiveProgressSource[] = ["MANUAL", "DIRECT_KRS"];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ObjectiveDetailPage({ params, searchParams }: ObjectiveDetailPageProps) {
  const currentUser = await requireUser();
  const { id } = await params;
  const error = firstParam((await searchParams)?.error);

  const [objective, users, departments, teams] = await Promise.all([
    prisma.objective.findUnique({
      where: { id },
      include: {
        owner: true,
        department: true,
        team: true,
        parentObjective: true,
        childObjectives: true,
        parentAssignments: {
          orderBy: { contributionPercent: "desc" },
          include: {
            assignedObjective: {
              include: { owner: true, department: true, team: true },
            },
            approvedBy: { select: { name: true } },
          },
        },
        keyResults: {
          orderBy: { createdAt: "asc" },
          include: {
            owner: true,
            monthlyTargets: {
              orderBy: { monthIndex: "asc" },
            },
          },
        },
      },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.team.findMany({
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
      include: { department: true },
    }),
  ]);

  if (!objective) {
    notFound();
  }

  const objectiveHealth = calculateObjectiveHealth(getObjectiveChildStatuses(objective));
  const krWeightValidation = validateObjectiveKrWeights({
    weights: objective.keyResults.map((keyResult) => ({ percent: keyResult.weightPercent })),
    status: objective.status,
    approvalStatus: objective.approvalStatus,
  });
  const defaultNewKrWeight = objective.keyResults.length === 0 ? 100 : 0;
  const canManageDirectKrs = objective.progressSource !== "CHILD_OBJECTIVES";
  const isOwner = objective.ownerId === currentUser.id;
  const canEditObjective = isOwner || currentUser.role === "CEO" || currentUser.role === "ADMIN";

  return (
    <div className="stack">
      <PageHeader title={objective.title} description={objective.description ?? "Objective detail and KR management."} />
      {error ? <div className="alert">{error}</div> : null}

      <div className="grid grid-2">
        <Card>
          <CardHeader>
            <h2>Objective Summary</h2>
            <p>Release 1 tracks objective metadata separately from KR progress.</p>
          </CardHeader>
          <CardContent>
            <div className="detail-list">
              <div className="detail-row">
                <span className="detail-label">Level</span>
                <span>{formatEnumLabel(objective.level)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Owner</span>
                <span>{objective.owner.name}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Org</span>
                <span>
                  {objective.department?.name ?? "Company"}
                  {objective.team ? ` / ${objective.team.name}` : ""}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Status</span>
                <Badge tone={workStatusTone(objective.status)}>{formatEnumLabel(objective.status)}</Badge>
              </div>
              <div className="detail-row">
                <span className="detail-label">Computed Health</span>
                {objectiveHealth.computedStatus ? (
                  <span className="stack">
                    <Badge tone={workStatusTone(objectiveHealth.computedStatus)}>{formatEnumLabel(objectiveHealth.computedStatus)}</Badge>
                    {objectiveHealth.reason ? <small className="muted">{objectiveHealth.reason}</small> : null}
                  </span>
                ) : (
                  <span className="muted">No health signal from children</span>
                )}
              </div>
              <div className="detail-row">
                <span className="detail-label">Progress Source</span>
                <Badge tone={objective.progressSource === "MANUAL" ? "neutral" : "success"}>{formatEnumLabel(objective.progressSource)}</Badge>
              </div>
              <div className="detail-row">
                <span className="detail-label">Approval</span>
                <span>{formatEnumLabel(objective.approvalStatus)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Confidence</span>
                <span>{objective.confidenceScore}/5</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Progress</span>
                <span className="stack">
                  {Math.round(objective.progressPercent)}%
                  <ProgressBar value={objective.progressPercent} />
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Parent</span>
                <span>
                  {objective.parentObjective ? (
                    <Link href={`/objectives/${objective.parentObjective.id}`}>{objective.parentObjective.title}</Link>
                  ) : (
                    "None"
                  )}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {canEditObjective ? (
        <Card>
          <CardHeader>
            <h2>Edit Objective</h2>
            <p>Update objective ownership, alignment, progress, confidence, and status.</p>
          </CardHeader>
          <CardContent>
            <form action={updateObjectiveAction} className="form-grid">
              <input name="objectiveId" type="hidden" value={objective.id} />
              <label className="field wide">
                <span>Title</span>
                <input defaultValue={objective.title} name="title" required />
              </label>
              <label className="field wide">
                <span>Description</span>
                <textarea defaultValue={objective.description ?? ""} name="description" />
              </label>
              <label className="field">
                <span>Quarter</span>
                <input defaultValue={objective.quarter} name="quarter" required />
              </label>
              <label className="field">
                <span>Level</span>
                <select defaultValue={objective.level} name="level" required>
                  {objectiveLevels.map((level) => (
                    <option key={level} value={level}>
                      {formatEnumLabel(level)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Owner</span>
                <select defaultValue={objective.ownerId} name="ownerId" required>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Status</span>
                <select defaultValue={objective.status} name="status" required>
                  {workStatuses.map((status) => (
                    <option key={status} value={status}>
                      {formatEnumLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Progress Source</span>
                <select defaultValue={objective.progressSource} name="progressSource" required>
                  {objectiveProgressSources.map((source) => (
                    <option key={source} value={source}>
                      {formatEnumLabel(source)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Department</span>
                <select defaultValue={objective.departmentId ?? ""} name="departmentId">
                  <option value="">None</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Team</span>
                <select defaultValue={objective.teamId ?? ""} name="teamId">
                  <option value="">None</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.department.name} / {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Progress Percent</span>
                <input defaultValue={objective.progressPercent} max="100" min="0" name="progressPercent" type="number" />
                {objective.progressSource !== "MANUAL" ? <small>Calculated sources recalculate after save and related child updates.</small> : null}
              </label>
              <label className="field">
                <span>Confidence</span>
                <input defaultValue={objective.confidenceScore} max="5" min="1" name="confidenceScore" type="number" />
              </label>
              <div className="wide">
                <Button type="submit">Update Objective</Button>
              </div>
            </form>
          </CardContent>
        </Card>
        ) : null}
      </div>

      {canManageDirectKrs ? (
        <Card>
          <CardHeader>
            <h2>Add Key Result</h2>
            <p>Create a measurable KR under this objective with monthly targets.</p>
          </CardHeader>
          <CardContent>
            <form action={createKeyResultAction} className="form-grid">
              <input name="objectiveId" type="hidden" value={objective.id} />
              <label className="field wide">
                <span>Title</span>
                <input name="title" placeholder="Increase release readiness to 100%" required />
              </label>
              <label className="field">
                <span>Metric</span>
                <input name="metricName" placeholder="Readiness percent" />
              </label>
              <label className="field">
                <span>Owner</span>
                <select name="ownerId" required>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Start</span>
                <input defaultValue="0" name="startValue" type="number" />
              </label>
              <label className="field">
                <span>Current</span>
                <input defaultValue="0" name="currentValue" type="number" />
              </label>
              <label className="field">
                <span>Target</span>
                <input defaultValue="100" name="targetValue" type="number" />
              </label>
              <label className="field">
                <span>Status</span>
                <select defaultValue="ON_TRACK" name="status" required>
                  {workStatuses.map((status) => (
                    <option key={status} value={status}>
                      {formatEnumLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Confidence</span>
                <input defaultValue="3" max="5" min="1" name="confidenceScore" type="number" />
              </label>
              <label className="field">
                <span>Weight Percent</span>
                <input defaultValue={defaultNewKrWeight} max="100" min="0" name="weightPercent" type="number" />
              </label>
              {[1, 2, 3].map((monthIndex) => (
                <div className="form-grid wide" key={monthIndex}>
                  <label className="field">
                    <span>Month {monthIndex} Target Value</span>
                    <input defaultValue={monthIndex === 3 ? "100" : String(monthIndex * 33)} name={`targetValue${monthIndex}`} type="number" />
                  </label>
                  <label className="field">
                    <span>Month {monthIndex} Target Percent</span>
                    <input defaultValue={monthIndex === 3 ? "100" : String(monthIndex * 33)} max="100" min="0" name={`targetPercent${monthIndex}`} type="number" />
                  </label>
                </div>
              ))}
              <div className="wide">
                <Button type="submit">Create KR</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <h2>Key Results</h2>
          <p>
            {objective.keyResults.length} KRs are linked to this objective. KR weights total {krWeightValidation.total}%.
          </p>
        </CardHeader>
        <CardContent>
          {objective.progressSource === "CHILD_OBJECTIVES" ? (
            <div className="notice">This objective calculates progress from child objectives. Direct KRs are not used in the roll-up.</div>
          ) : krWeightValidation.message ? (
            <div className={`notice ${krWeightValidation.isValid ? "" : "notice-danger"}`}>{krWeightValidation.message}</div>
          ) : objective.progressSource === "DIRECT_KRS" && objective.keyResults.length > 0 ? (
            <div className="notice">KR weights are balanced at 100%.</div>
          ) : (
            <div className="notice">KR weights are optional unless this objective calculates progress from direct KRs.</div>
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
                  <th>Monthly Targets</th>
                </tr>
              </thead>
              <tbody>
                {objective.keyResults.map((keyResult) => (
                  <tr key={keyResult.id}>
                    <td>
                      <Link href={`/key-results/${keyResult.id}`}>
                        <strong>{keyResult.title}</strong>
                      </Link>
                      <br />
                      <span className="muted">{keyResult.metricName ?? "No metric label"}</span>
                    </td>
                    <td>{keyResult.owner.name}</td>
                    <td>
                      <Badge tone={workStatusTone(keyResult.status)}>{formatEnumLabel(keyResult.status)}</Badge>
                    </td>
                    <td>
                      <Badge tone={pacingStatusTone(keyResult.pacingStatus)}>{formatEnumLabel(keyResult.pacingStatus)}</Badge>
                    </td>
                    <td>{keyResult.confidenceScore}/5</td>
                    <td>{keyResult.weightPercent}%</td>
                    <td>
                      <div className="stack">
                        <span>
                          {keyResult.currentValue} / {keyResult.targetValue}
                        </span>
                        <ProgressBar value={keyResult.progressPercent} />
                      </div>
                    </td>
                    <td>
                      {keyResult.monthlyTargets.map((target) => (
                        <div key={target.id}>
                          M{target.monthIndex}: {target.targetPercent ?? 0}%
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
                {objective.keyResults.length === 0 ? (
                  <tr>
                    <td colSpan={8}>No KRs have been created for this objective yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
