import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { pacingStatusTone, workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

export default async function MyOkrsPage() {
  const user = await requireUser();

  const [ownedObjectives, ownedKeyResults] = await Promise.all([
    prisma.objective.findMany({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        keyResults: true,
        department: true,
        team: true,
      },
    }),
    prisma.keyResult.findMany({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        objective: true,
        monthlyTargets: {
          orderBy: { monthIndex: "asc" },
        },
      },
    }),
  ]);

  return (
    <div className="stack">
      <PageHeader
        title="My OKRs"
        description={`Objective and KR workspace for ${user.name}, showing status, confidence, and pacing separately.`}
      />

      <Card>
        <CardHeader>
          <h2>Owned Objectives</h2>
          <p>{ownedObjectives.length} objectives are directly owned by you.</p>
        </CardHeader>
        <CardContent>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Objective</th>
                  <th>Org</th>
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
                    <td colSpan={6}>No owned objectives yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2>Assigned Key Results</h2>
          <p>{ownedKeyResults.length} KRs are assigned to you.</p>
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
                  </tr>
                ))}
                {ownedKeyResults.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No assigned KRs yet.</td>
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
