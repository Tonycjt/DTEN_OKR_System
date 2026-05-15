import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

export default async function CompanyOkrsPage() {
  await requireUser();

  const objectives = await prisma.objective.findMany({
    where: { owner: { role: "CEO" } },
    orderBy: [{ level: "asc" }, { createdAt: "asc" }],
    include: {
      owner: true,
      department: true,
      team: true,
      keyResults: {
        include: { owner: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return (
    <div className="stack">
      <PageHeader
        title="Company OKRs"
        description="Company-level objectives set by leadership."
      />

      <Card>
        <CardHeader>
          <h2>Objective Directory</h2>
          <p>{objectives.length} objectives are currently tracked for Release 1.</p>
        </CardHeader>
        <CardContent>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Objective</th>
                  <th>Level</th>
                  <th>Owner</th>
                  <th>Org</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>KRs</th>
                </tr>
              </thead>
              <tbody>
                {objectives.map((objective) => (
                  <tr key={objective.id}>
                    <td>
                      <strong>{objective.title}</strong>
                    </td>
                    <td>{formatEnumLabel(objective.level)}</td>
                    <td>{objective.owner.name}</td>
                    <td>
                      {objective.department?.name ?? "Company"}
                      {objective.team ? ` / ${objective.team.name}` : ""}
                    </td>
                    <td>
                      <Badge tone={workStatusTone(objective.status)}>{formatEnumLabel(objective.status)}</Badge>
                    </td>
                    <td>
                      <div className="stack">
                        <span>{Math.round(objective.progressPercent)}%</span>
                        <ProgressBar value={objective.progressPercent} />
                      </div>
                    </td>
                    <td>
                      {objective.keyResults.length}
                      {objective.keyResults.length > 0 ? (
                        <>
                          <br />
                          <span className="muted">{objective.keyResults.map((kr) => kr.owner?.name ?? "—").join(", ")}</span>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
