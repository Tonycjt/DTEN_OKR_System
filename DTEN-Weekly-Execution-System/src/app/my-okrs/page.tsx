import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { pacingStatusTone, workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { getQuarterMonthNames } from "@/lib/okr-calculations";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

export default async function MyOkrsPage() {
  const user = await requireUser();

  const [ownedObjectives, ownedKeyResults] = await Promise.all([
    prisma.objective.findMany({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      include: { keyResults: true, department: true, team: true },
    }),
    prisma.keyResult.findMany({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        objective: {
          include: { department: true, team: true, keyResults: { select: { id: true } } },
        },
        monthlyTargets: { orderBy: { monthIndex: "asc" } },
      },
    }),
  ]);

  // Objectives related via assigned KRs (not owned by user)
  const ownedObjectiveIds = new Set(ownedObjectives.map((o) => o.id));
  const assignedKrObjectives = ownedKeyResults
    .map((kr) => kr.objective)
    .filter((objective) => !ownedObjectiveIds.has(objective.id))
    .reduce<typeof ownedKeyResults[number]["objective"][]>((unique, objective) => {
      if (!unique.some((o) => o.id === objective.id)) unique.push(objective);
      return unique;
    }, []);

  return (
    <div className="stack">
      <PageHeader
        title="My OKRs"
        description={`Objectives and Key Results for ${user.name}. OWNER = you own the objective. ASSIGNED KR = you own a KR under the objective.`}
      />

      <Card>
        <CardHeader>
          <h2>Owned Objectives</h2>
          <p>{ownedObjectives.length} objectives where you are the owner.</p>
        </CardHeader>
        <CardContent>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Objective</th>
                  <th>Org</th>
                  <th>Tag</th>
                  <th>Status</th>
                  <th>Confidence</th>
                  <th>Progress</th>
                  <th>KRs</th>
                </tr>
              </thead>
              <tbody>
                {ownedObjectives.map((objective) => (
                  <tr key={objective.id}>
                    <td>
                      <Link href={`/objectives/${objective.id}`}>
                        <strong>{objective.title}</strong>
                      </Link>
                    </td>
                    <td>
                      {objective.department?.name ?? "Company"}
                      {objective.team ? ` / ${objective.team.name}` : ""}
                    </td>
                    <td>
                      <Badge tone="info">Owner</Badge>
                    </td>
                    <td>
                      <Badge tone={workStatusTone(objective.status)}>{formatEnumLabel(objective.status)}</Badge>
                    </td>
                    <td>{objective.confidenceScore}/5</td>
                    <td>
                      <div className="stack">
                        <span>{Math.round(objective.progressPercent)}%</span>
                        <ProgressBar value={objective.progressPercent} />
                      </div>
                    </td>
                    <td>{objective.keyResults.length}</td>
                  </tr>
                ))}
                {ownedObjectives.length === 0 ? (
                  <tr>
                    <td colSpan={7}>No owned objectives yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {assignedKrObjectives.length > 0 ? (
        <Card>
          <CardHeader>
            <h2>Objectives via Assigned KRs</h2>
            <p>{assignedKrObjectives.length} objectives where you own at least one KR. Read-only unless you are also the objective owner.</p>
          </CardHeader>
          <CardContent>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Objective</th>
                    <th>Org</th>
                    <th>Tag</th>
                    <th>Status</th>
                    <th>Confidence</th>
                    <th>Progress</th>
                    <th>Total KRs</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedKrObjectives.map((objective) => (
                    <tr key={objective.id}>
                      <td>
                        <Link href={`/objectives/${objective.id}`}>
                          <strong>{objective.title}</strong>
                        </Link>
                      </td>
                      <td>
                        {objective.department?.name ?? "Company"}
                        {objective.team ? ` / ${objective.team.name}` : ""}
                      </td>
                      <td>
                        <Badge tone="neutral">Assigned KR</Badge>
                      </td>
                      <td>
                        <Badge tone={workStatusTone(objective.status)}>{formatEnumLabel(objective.status)}</Badge>
                      </td>
                      <td>{objective.confidenceScore}/5</td>
                      <td>
                        <div className="stack">
                          <span>{Math.round(objective.progressPercent)}%</span>
                          <ProgressBar value={objective.progressPercent} />
                        </div>
                      </td>
                      <td>{objective.keyResults.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <h2>Assigned Key Results</h2>
          <p>{ownedKeyResults.length} KRs assigned to you across all objectives.</p>
        </CardHeader>
        <CardContent>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Key Result</th>
                  <th>Objective</th>
                  <th>Status</th>
                  <th>Pacing</th>
                  <th>Confidence</th>
                  <th>Progress</th>
                  <th>Monthly Targets</th>
                </tr>
              </thead>
              <tbody>
                {ownedKeyResults.map((keyResult) => (
                  <tr key={keyResult.id}>
                    <td>
                      <Link href={`/key-results/${keyResult.id}`}>
                        <strong>{keyResult.title}</strong>
                      </Link>
                    </td>
                    <td>
                      <Link href={`/objectives/${keyResult.objectiveId}`}>{keyResult.objective.title}</Link>
                    </td>
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
                      {keyResult.monthlyTargets.length > 0
                        ? keyResult.monthlyTargets.map((t) => {
                            const names = getQuarterMonthNames(keyResult.objective.quarter);
                            return `${names[t.monthIndex - 1]}: ${t.title ?? "–"}`;
                          }).join(" / ")
                        : "No targets set"}
                    </td>
                  </tr>
                ))}
                {ownedKeyResults.length === 0 ? (
                  <tr>
                    <td colSpan={7}>No assigned KRs yet.</td>
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
