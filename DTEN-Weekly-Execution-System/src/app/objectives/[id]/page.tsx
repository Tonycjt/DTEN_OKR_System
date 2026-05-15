import Link from "next/link";
import { notFound } from "next/navigation";
import { createKeyResultAction } from "@/app/objectives/actions";
import { EditObjectiveForm } from "@/app/objectives/edit-objective-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { pacingStatusTone, workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { calculateObjectiveHealth, getObjectiveChildStatuses } from "@/lib/objective-health";
import { getMonthIndexForQuarter, getQuarterMonthNames } from "@/lib/okr-calculations";
import { getAssignableUsers } from "@/lib/org-scope";
import { validateObjectiveKrWeights } from "@/lib/rollup-validation";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

type ObjectiveDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string | string[] }>;
};

const workStatuses = ["DRAFT", "ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETED", "ON_HOLD"] as const;

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
            assignedObjective: { include: { owner: true, department: true, team: true } },
            approvedBy: { select: { name: true } },
          },
        },
        keyResults: {
          orderBy: { createdAt: "asc" },
          include: {
            owner: true,
            monthlyTargets: { orderBy: { monthIndex: "asc" } },
          },
        },
      },
    }),
    getAssignableUsers(currentUser.id, currentUser.role),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.team.findMany({
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
      include: { department: true },
    }),
  ]);

  if (!objective) notFound();

  const objectiveHealth = calculateObjectiveHealth(getObjectiveChildStatuses(objective));
  const quarterMonthNames = getQuarterMonthNames(objective.quarter);
  const currentMonthIdx = getMonthIndexForQuarter(objective.quarter);
  const krWeightValidation = validateObjectiveKrWeights({
    weights: objective.keyResults.map((kr) => ({ percent: kr.weightPercent })),
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
        {/* Summary */}
        <Card>
          <CardHeader>
            <h2>Objective Summary</h2>
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
            </div>
          </CardContent>
        </Card>

        {/* Edit form — client component */}
        {canEditObjective ? (
          <Card>
            <CardHeader>
              <h2>{objective.status === "DRAFT" ? "Edit Draft Objective" : "Edit Objective"}</h2>
              <p>
                {objective.status === "DRAFT"
                  ? "Save for Later keeps it as a draft. Publish validates and activates it."
                  : "DRAFT status is not available for already-published objectives."}
              </p>
            </CardHeader>
            <CardContent>
              <EditObjectiveForm
                objective={{
                  id: objective.id,
                  title: objective.title,
                  description: objective.description,
                  level: objective.level,
                  status: objective.status,
                  quarter: objective.quarter,
                  progressSource: objective.progressSource,
                  progressPercent: objective.progressPercent,
                  confidenceScore: objective.confidenceScore,
                  ownerId: objective.ownerId,
                  departmentId: objective.departmentId,
                  teamId: objective.teamId,
                }}
                users={users.map((u) => ({ id: u.id, name: u.name }))}
                departments={departments}
                teams={teams.map((t) => ({ id: t.id, name: t.name, department: { name: t.department.name } }))}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Add Key Result */}
      {canEditObjective && canManageDirectKrs ? (
        <Card>
          <CardHeader>
            <h2>Add Key Result</h2>
            <p>Create a measurable KR under this objective. Set monthly goals on the KR detail page after creation.</p>
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
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
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
                  {workStatuses.map((s) => (
                    <option key={s} value={s}>{formatEnumLabel(s)}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Confidence</span>
                <input defaultValue="3" max="5" min="1" name="confidenceScore" type="number" />
              </label>
              <label className="field">
                <span>Weight %</span>
                <input defaultValue={defaultNewKrWeight} max="100" min="0" name="weightPercent" type="number" />
              </label>
              <div className="wide">
                <Button type="submit">Create KR</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Key Results table */}
      <Card>
        <CardHeader>
          <h2>Key Results</h2>
          <p>
            {objective.keyResults.length} KRs linked. KR weights total {krWeightValidation.total}%.
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
                </tr>
              </thead>
              <tbody>
                {objective.keyResults.map((kr) => (
                  <tr key={kr.id}>
                    <td>
                      <Link href={`/key-results/${kr.id}`}>
                        <strong>{kr.title}</strong>
                      </Link>
                      <br />
                      <span className="muted">{kr.metricName ?? "No metric label"}</span>
                    </td>
                    <td>{kr.owner.name}</td>
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
                    <td className="muted">
                      {currentMonthIdx
                        ? (() => {
                            const t = kr.monthlyTargets.find((m) => m.monthIndex === currentMonthIdx);
                            return `${quarterMonthNames[currentMonthIdx - 1]}: ${t?.title ?? "—"}`;
                          })()
                        : kr.monthlyTargets.length > 0
                          ? kr.monthlyTargets.map((t) => `${quarterMonthNames[t.monthIndex - 1]}: ${t.title ?? "–"}`).join(" / ")
                          : "—"}
                    </td>
                  </tr>
                ))}
                {objective.keyResults.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="muted">No KRs yet. Add one above.</td>
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

