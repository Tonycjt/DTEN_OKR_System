import Link from "next/link";
import type { ObjectiveLevel, ObjectiveProgressMode, WorkStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import {
  batchUpdateObjectiveAssignmentsAction,
  createKeyResultAction,
  createObjectiveAssignmentAction,
  deleteObjectiveAssignmentAction,
  updateObjectiveAction,
} from "@/app/objectives/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { pacingStatusTone, workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { validateObjectiveAssignmentContributions, validateObjectiveKrWeights } from "@/lib/rollup-validation";
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
const objectiveProgressModes: ObjectiveProgressMode[] = ["MANUAL", "AUTO"];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ObjectiveDetailPage({ params, searchParams }: ObjectiveDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const error = firstParam((await searchParams)?.error);

  const [objective, users, departments, teams, parentObjectives] = await Promise.all([
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
              include: {
                owner: true,
                department: true,
                team: true,
              },
            },
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
    prisma.objective.findMany({
      where: {
        NOT: { id },
      },
      orderBy: [{ level: "asc" }, { title: "asc" }],
    }),
  ]);

  if (!objective) {
    notFound();
  }

  const krWeightValidation = validateObjectiveKrWeights({
    weights: objective.keyResults.map((keyResult) => ({ percent: keyResult.weightPercent })),
    status: objective.status,
    approvalStatus: objective.approvalStatus,
  });
  const assignmentContributionValidation = validateObjectiveAssignmentContributions({
    contributions: objective.parentAssignments.map((assignment) => ({ percent: assignment.contributionPercent })),
    status: objective.status,
    approvalStatus: objective.approvalStatus,
  });
  const defaultNewKrWeight = objective.keyResults.length === 0 ? 100 : 0;
  const userNameById = new Map(users.map((user) => [user.id, user.name]));
  const departmentNameById = new Map(departments.map((department) => [department.id, department.name]));
  const teamNameById = new Map(teams.map((team) => [team.id, `${team.department.name} / ${team.name}`]));

  function assignmentOwnerLabel(assignment: { assigneeType: "USER" | "TEAM" | "DEPARTMENT"; assigneeId: string }) {
    if (assignment.assigneeType === "USER") {
      return userNameById.get(assignment.assigneeId) ?? "Unknown user";
    }

    if (assignment.assigneeType === "TEAM") {
      return teamNameById.get(assignment.assigneeId) ?? "Unknown team";
    }

    return departmentNameById.get(assignment.assigneeId) ?? "Unknown department";
  }

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
                <span className="detail-label">Progress Mode</span>
                <Badge tone={objective.progressMode === "AUTO" ? "success" : "neutral"}>{formatEnumLabel(objective.progressMode)}</Badge>
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
                <span>Progress Mode</span>
                <select defaultValue={objective.progressMode} name="progressMode" required>
                  {objectiveProgressModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {formatEnumLabel(mode)}
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
                <span>Parent Objective</span>
                <select defaultValue={objective.parentObjectiveId ?? ""} name="parentObjectiveId">
                  <option value="">None</option>
                  {parentObjectives.map((parentObjective) => (
                    <option key={parentObjective.id} value={parentObjective.id}>
                      {parentObjective.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Progress Percent</span>
                <input defaultValue={objective.progressPercent} max="100" min="0" name="progressPercent" type="number" />
                {objective.progressMode === "AUTO" ? <small>Auto objectives recalculate from weighted child KRs after save.</small> : null}
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
      </div>

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

      <Card>
        <CardHeader>
          <h2>Key Results</h2>
          <p>
            {objective.keyResults.length} KRs are linked to this objective. KR weights total {krWeightValidation.total}%.
          </p>
        </CardHeader>
        <CardContent>
          {krWeightValidation.message ? (
            <div className={`notice ${krWeightValidation.isValid ? "" : "notice-danger"}`}>{krWeightValidation.message}</div>
          ) : (
            <div className="notice">KR weights are balanced at 100%.</div>
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

      <Card>
        <CardHeader>
          <h2>Objective Contributions</h2>
          <p>
            {objective.parentAssignments.length} assignments contribute to this objective. Contributions total {assignmentContributionValidation.total}%.
          </p>
        </CardHeader>
        <CardContent>
          {assignmentContributionValidation.message ? (
            <div className={`notice ${assignmentContributionValidation.isValid ? "" : "notice-danger"}`}>{assignmentContributionValidation.message}</div>
          ) : (
            <div className="notice">Objective assignment contributions are balanced at 100%.</div>
          )}

          <form action={batchUpdateObjectiveAssignmentsAction} id="assignment-batch-form">
            <input name="parentObjectiveId" type="hidden" value={objective.id} />
          </form>

          <form action={createObjectiveAssignmentAction} className="form-grid">
            <input name="parentObjectiveId" type="hidden" value={objective.id} />
            <label className="field">
              <span>Assignment Owner</span>
              <select name="assigneeRef" required>
                <option value="">Choose owner</option>
                <optgroup label="Departments">
                  {departments.map((department) => (
                    <option key={department.id} value={`DEPARTMENT::${department.id}`}>
                      {department.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Teams">
                  {teams.map((team) => (
                    <option key={team.id} value={`TEAM::${team.id}`}>
                      {team.department.name} / {team.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Users">
                  {users.map((user) => (
                    <option key={user.id} value={`USER::${user.id}`}>
                      {user.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label className="field">
              <span>Linked Child Objective</span>
              <select name="assignedObjectiveId">
                <option value="">No linked child objective yet</option>
                {parentObjectives.map((parentObjective) => (
                  <option key={parentObjective.id} value={parentObjective.id}>
                    {parentObjective.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Contribution Percent</span>
              <input defaultValue="0" max="100" min="0" name="contributionPercent" type="number" />
            </label>
            <div className="field button-field">
              <Button type="submit">Add Assignment</Button>
            </div>
          </form>

          {objective.parentAssignments.length > 0 ? (
            <div className="table-actions">
              <Button form="assignment-batch-form" type="submit">
                Save All Contributions
              </Button>
            </div>
          ) : null}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Owner</th>
                  <th>Child Objective</th>
                  <th>Contribution</th>
                  <th>Child Progress</th>
                  <th>Weighted Impact</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {objective.parentAssignments.map((assignment) => {
                  const childProgress = assignment.assignedObjective?.progressPercent ?? 0;
                  const weightedImpact = childProgress * (assignment.contributionPercent / 100);

                  return (
                    <tr key={assignment.id}>
                      <td>
                        <strong>{assignmentOwnerLabel(assignment)}</strong>
                        <br />
                        <span className="muted">{formatEnumLabel(assignment.assigneeType)}</span>
                      </td>
                      <td>
                        {assignment.assignedObjective ? (
                          <Link href={`/objectives/${assignment.assignedObjective.id}`}>{assignment.assignedObjective.title}</Link>
                        ) : (
                          <span className="muted">No child objective linked</span>
                        )}
                      </td>
                      <td>{assignment.contributionPercent}%</td>
                      <td>{Math.round(childProgress)}%</td>
                      <td>{Math.round(weightedImpact)} pts</td>
                      <td>
                        <div className="stack">
                          <input form="assignment-batch-form" name="assignmentId" type="hidden" value={assignment.id} />
                          <select className="inline-select" defaultValue={assignment.assignedObjectiveId ?? ""} form="assignment-batch-form" name="assignedObjectiveId">
                            <option value="">No linked child objective</option>
                            {parentObjectives.map((parentObjective) => (
                              <option key={parentObjective.id} value={parentObjective.id}>
                                {parentObjective.title}
                              </option>
                            ))}
                          </select>
                          <div className="table-actions">
                            <input
                              className="inline-number"
                              defaultValue={assignment.contributionPercent}
                              form="assignment-batch-form"
                              max="100"
                              min="0"
                              name="contributionPercent"
                              type="number"
                            />
                            <span className="muted">Save with all rows</span>
                          </div>
                          <form action={deleteObjectiveAssignmentAction}>
                            <input name="assignmentId" type="hidden" value={assignment.id} />
                            <input name="parentObjectiveId" type="hidden" value={objective.id} />
                            <Button tone="secondary" type="submit">
                              Delete
                            </Button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {objective.parentAssignments.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No contribution assignments yet.</td>
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
