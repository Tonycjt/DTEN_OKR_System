import Link from "next/link";
import type { WorkStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import { createKeyResultAction } from "@/app/objectives/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { pacingStatusTone, workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

type ObjectiveDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

const workStatuses: WorkStatus[] = ["DRAFT", "ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETED", "ON_HOLD"];

export default async function ObjectiveDetailPage({ params }: ObjectiveDetailPageProps) {
  await requireUser();
  const { id } = await params;

  const [objective, users] = await Promise.all([
    prisma.objective.findUnique({
      where: { id },
      include: {
        owner: true,
        department: true,
        team: true,
        parentObjective: true,
        childObjectives: true,
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
  ]);

  if (!objective) {
    notFound();
  }

  return (
    <div className="stack">
      <PageHeader title={objective.title} description={objective.description ?? "Objective detail and KR management."} />

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
      </div>

      <Card>
        <CardHeader>
          <h2>Key Results</h2>
          <p>{objective.keyResults.length} KRs are linked to this objective.</p>
        </CardHeader>
        <CardContent>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Key Result</th>
                  <th>Owner</th>
                  <th>Status</th>
                  <th>Pacing</th>
                  <th>Confidence</th>
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
                    <td colSpan={7}>No KRs have been created for this objective yet.</td>
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
