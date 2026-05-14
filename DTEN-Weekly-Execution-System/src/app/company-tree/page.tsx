import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

export default async function CompanyTreePage() {
  await requireUser();

  const [departments, objectives] = await Promise.all([
    prisma.department.findMany({
      orderBy: { name: "asc" },
      include: {
        teams: { orderBy: { name: "asc" } },
      },
    }),
    prisma.objective.findMany({
      orderBy: [{ level: "asc" }, { createdAt: "asc" }],
      include: {
        owner: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        keyResults: { select: { id: true } },
      },
    }),
  ]);

  const byLevel = {
    COMPANY: objectives.filter((o) => o.level === "COMPANY"),
    DEPARTMENT: objectives.filter((o) => o.level === "DEPARTMENT"),
    TEAM: objectives.filter((o) => o.level === "TEAM"),
    INDIVIDUAL: objectives.filter((o) => o.level === "INDIVIDUAL"),
  };

  return (
    <div className="stack">
      <PageHeader
        title="Company Tree"
        description="Objectives organized by org level — company, department, team, and individual."
        actions={<LinkButton href="/objectives/new">Create Objective</LinkButton>}
      />

      <Card>
        <CardHeader>
          <h2>Company</h2>
          <p>{byLevel.COMPANY.length} company-level objectives.</p>
        </CardHeader>
        <CardContent>
          <ObjectiveList objectives={byLevel.COMPANY} />
        </CardContent>
      </Card>

      {departments.map((department) => {
        const deptObjectives = byLevel.DEPARTMENT.filter((o) => o.departmentId === department.id);

        return (
          <Card key={department.id}>
            <CardHeader>
              <h2>{department.name}</h2>
              <p>{deptObjectives.length} department-level objectives.</p>
            </CardHeader>
            <CardContent>
              <ObjectiveList objectives={deptObjectives} />

              {department.teams.map((team) => {
                const teamObjectives = byLevel.TEAM.filter((o) => o.teamId === team.id);

                return (
                  <div className="stack" key={team.id} style={{ marginTop: "1rem" }}>
                    <h3 className="muted">{team.name}</h3>
                    <ObjectiveList objectives={teamObjectives} />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      {byLevel.INDIVIDUAL.length > 0 ? (
        <Card>
          <CardHeader>
            <h2>Individual</h2>
            <p>{byLevel.INDIVIDUAL.length} individual-level objectives.</p>
          </CardHeader>
          <CardContent>
            <ObjectiveList objectives={byLevel.INDIVIDUAL} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

type ObjectiveRow = {
  id: string;
  title: string;
  status: string;
  progressPercent: number;
  owner: { name: string };
  keyResults: { id: string }[];
};

function ObjectiveList({ objectives }: { objectives: ObjectiveRow[] }) {
  if (objectives.length === 0) {
    return <p className="muted">No objectives at this level.</p>;
  }

  return (
    <div className="route-grid">
      {objectives.map((objective) => (
        <div className="route-item" key={objective.id}>
          <span>
            <Link href={`/objectives/${objective.id}`}>
              <strong>{objective.title}</strong>
            </Link>
            <br />
            <span className="muted">
              {objective.owner.name} · {objective.keyResults.length} KR{objective.keyResults.length !== 1 ? "s" : ""}
            </span>
          </span>
          <span className="stack" style={{ alignItems: "flex-end", minWidth: "8rem" }}>
            <Badge tone={workStatusTone(objective.status as Parameters<typeof workStatusTone>[0])}>{formatEnumLabel(objective.status)}</Badge>
            <ProgressBar value={objective.progressPercent} />
          </span>
        </div>
      ))}
    </div>
  );
}
