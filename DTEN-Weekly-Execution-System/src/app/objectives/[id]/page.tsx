import { notFound } from "next/navigation";
import { createKeyResultAction } from "@/app/objectives/actions";
import { EditObjectiveForm } from "@/app/objectives/edit-objective-form";
import { KrManagementSection } from "@/app/objectives/kr-management-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { calculateObjectiveHealth, getObjectiveChildStatuses } from "@/lib/objective-health";
import { getMonthIndexForQuarter, getQuarterMonthNames } from "@/lib/okr-calculations";
import { getDirectScopeUsers } from "@/lib/org-scope";
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
        keyResults: {
          orderBy: { createdAt: "asc" },
          include: {
            owner: true,
            monthlyTargets: { orderBy: { monthIndex: "asc" } },
          },
        },
      },
    }),
    getDirectScopeUsers(currentUser.id),
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
  const isOwner = objective.ownerId === currentUser.id;
  const canEditObjective = isOwner || currentUser.role === "CEO" || currentUser.role === "ADMIN";

  return (
    <div className="stack">
      <PageHeader title={objective.title} description={objective.description ?? "Objective detail and KR management."} />
      {error ? <div className="alert">{error}</div> : null}

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
      ) : null}

      {/* Add Key Result */}
      {canEditObjective ? (
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
                <select name="ownerId">
                  <option value="">No owner (assign later)</option>
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

      {/* Key Results table with edit/delete */}
      <KrManagementSection
        krs={objective.keyResults.map((kr) => ({
          id: kr.id,
          title: kr.title,
          metricName: kr.metricName,
          ownerId: kr.ownerId,
          owner: kr.owner ? { id: kr.owner.id, name: kr.owner.name, email: kr.owner.email } : null,
          startValue: kr.startValue,
          currentValue: kr.currentValue,
          targetValue: kr.targetValue,
          progressPercent: kr.progressPercent,
          weightPercent: kr.weightPercent,
          confidenceScore: kr.confidenceScore,
          status: kr.status,
          pacingStatus: kr.pacingStatus,
          monthlyTargets: kr.monthlyTargets,
        }))}
        objectiveId={objective.id}
        progressSource={objective.progressSource}
        users={users.map((u) => ({ id: u.id, name: u.name, email: u.email }))}
        canEdit={canEditObjective}
        quarterMonthNames={quarterMonthNames}
        currentMonthIdx={currentMonthIdx}
        krWeightMessage={krWeightValidation.message}
        krWeightIsValid={krWeightValidation.isValid}
        krWeightTotal={krWeightValidation.total}
      />
    </div>
  );
}

