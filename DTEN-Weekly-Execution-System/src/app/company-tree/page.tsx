import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatEnumLabel } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

export default async function CompanyTreePage() {
  const user = await requireUser();

  const [currentUser, directReports] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        title: true,
        role: true,
        department: { select: { name: true } },
        team: { select: { name: true } },
      },
    }),
    prisma.user.findMany({
      where: { managerId: user.id },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        title: true,
        role: true,
        department: { select: { name: true } },
        team: { select: { name: true } },
      },
    }),
  ]);

  return (
    <div className="stack">
      <PageHeader
        title="My Team"
        description="Your direct reports at a glance."
      />

      {directReports.length === 0 ? (
        <Card>
          <CardContent>
            <p className="muted">You have no direct reports.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="person-tree">
          {/* Root node — current user */}
          <div className="person-tree-root">
            <div className="person-tree-root-card">
              <strong>{currentUser.name}</strong>
              {currentUser.title ? <span className="muted">{currentUser.title}</span> : null}
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "center" }}>
                <Badge tone="info">{formatEnumLabel(currentUser.role)}</Badge>
                {currentUser.department ? <Badge tone="neutral">{currentUser.department.name}</Badge> : null}
              </div>
            </div>
          </div>

          {/* Connector line */}
          <div className="person-tree-connector" aria-hidden="true" />

          {/* Direct reports */}
          <div className="person-tree-children">
            {directReports.map((report) => (
              <div className="person-tree-child-card" key={report.id}>
                <strong>{report.name}</strong>
                {report.title ? <span className="muted">{report.title}</span> : null}
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "center" }}>
                  <Badge tone="neutral">{formatEnumLabel(report.role)}</Badge>
                  {report.department ? <Badge tone="neutral">{report.department.name}</Badge> : null}
                  {report.team ? <span className="muted" style={{ fontSize: "0.78rem" }}>{report.team.name}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
