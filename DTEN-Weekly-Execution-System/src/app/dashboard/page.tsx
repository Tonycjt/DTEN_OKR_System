import { ArrowRight } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatEnumLabel } from "@/lib/format";
import { releaseOneMilestones } from "@/lib/release-one";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

export default async function DashboardPage() {
  const user = await requireUser();

  const [objectiveCount, keyResultCount, pendingReviews, missingUpdates, highRiskKrs] = await Promise.all([
    prisma.objective.count(),
    prisma.keyResult.count(),
    prisma.weeklyReport.count({ where: { status: "SUBMITTED" } }),
    prisma.weeklyReport.count({ where: { status: "OVERDUE" } }),
    prisma.keyResult.findMany({
      where: {
        OR: [{ status: { in: ["AT_RISK", "OFF_TRACK"] } }, { pacingStatus: "BEHIND" }],
      },
      orderBy: [{ pacingStatus: "asc" }, { updatedAt: "desc" }],
      take: 5,
      include: {
        owner: true,
        objective: true,
      },
    }),
  ]);

  const upcoming = releaseOneMilestones.slice(5, 11);

  return (
    <div className="stack">
      <PageHeader
        title={`Welcome, ${user.name}`}
        description={`${formatEnumLabel(user.role)} workspace for the OKR weekly execution loop: Objective to KR, weekly priority, check-in, manager review, and dashboard visibility.`}
        actions={
          <LinkButton href="/weekly-report/current">
            Start Weekly Report
            <ArrowRight size={16} aria-hidden="true" />
          </LinkButton>
        }
      />

      <div className="grid grid-3">
        <StatCard label="Objectives" value={String(objectiveCount)} detail="seeded" tone="info" />
        <StatCard label="Key Results" value={String(keyResultCount)} detail="tracked" tone="success" />
        <StatCard label="Pending Reviews" value={String(pendingReviews)} detail="manager queue" tone="warning" />
      </div>

      <div className="grid grid-2">
        <Card>
          <CardHeader>
            <h2>High-Risk KRs</h2>
            <p>Seeded KR risk data is now coming from PostgreSQL.</p>
          </CardHeader>
          <CardContent>
            <div className="route-grid">
              {highRiskKrs.map((kr) => (
                <div className="route-item" key={kr.id}>
                  <span>
                    <strong>{kr.title}</strong>
                    <br />
                    <span className="muted">
                      {kr.objective.title} / {kr.owner.name}
                    </span>
                  </span>
                  <span>{formatEnumLabel(kr.pacingStatus)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2>Day 3 Focus</h2>
            <p>Auth and organization management are now the active Release 1 foundation.</p>
          </CardHeader>
          <CardContent>
            <div className="route-grid">
              <div className="route-item">
                <span>Missing weekly reports</span>
                <strong>{missingUpdates}</strong>
              </div>
              {upcoming.map((item) => (
                <div className="route-item" key={item}>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
