import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatEnumLabel } from "@/lib/format";
import { requireRole } from "@/server/auth";
import { prisma } from "@/server/prisma";
import { OrgImportForm } from "./org-import-form";

type OrgUser = Awaited<ReturnType<typeof getOrgUsers>>[number];

async function getOrgUsers() {
  return prisma.user.findMany({
    orderBy: [{ managerId: "asc" }, { name: "asc" }],
    include: {
      department: true,
      team: true,
      manager: true,
      localManager: true,
      reviewOwner: true,
    },
  });
}

function OrgTreeNode({
  user,
  usersByManagerId,
  depth = 0,
  path = new Set<string>(),
}: {
  user: OrgUser;
  usersByManagerId: Map<string | null, OrgUser[]>;
  depth?: number;
  path?: Set<string>;
}) {
  const directReports = usersByManagerId.get(user.id) ?? [];
  const effectiveReviewOwner = user.reviewOwner ?? user.manager;
  const hasMissingReviewer = user.isActive && user.role !== "CEO" && !effectiveReviewOwner;

  if (path.has(user.id)) {
    return null;
  }

  const nextPath = new Set(path);
  nextPath.add(user.id);

  return (
    <div className="org-tree-node">
      <div className="org-tree-card" style={{ marginLeft: `${depth * 22}px` }}>
        <div>
          <div className="org-tree-title">
            <strong>{user.name}</strong>
            <Badge tone={user.isActive ? "success" : "neutral"}>{user.isActive ? "Active" : "Inactive"}</Badge>
            {hasMissingReviewer ? <Badge tone="danger">Missing Reviewer</Badge> : null}
          </div>
          <p className="muted">
            {user.title ?? "No title"} / {formatEnumLabel(user.role)}
          </p>
          <p className="muted">
            {user.email}
            {user.employeeId ? ` / ${user.employeeId}` : ""}
          </p>
        </div>
        <div className="org-tree-meta">
          <span>{user.department?.name ?? "No department"}</span>
          <span>{user.team?.name ?? "No team"}</span>
          <span>Manager: {user.manager?.name ?? "None"}</span>
          <span>Review: {effectiveReviewOwner?.name ?? "None"}</span>
          <span>Direct reports: {directReports.length}</span>
        </div>
      </div>

      {directReports.map((report) => (
        <OrgTreeNode depth={depth + 1} key={report.id} path={nextPath} user={report} usersByManagerId={usersByManagerId} />
      ))}
    </div>
  );
}

export default async function OrgImportPage() {
  await requireRole(["ADMIN", "CEO"]);

  const users = await getOrgUsers();
  const usersByManagerId = users.reduce((groups, user) => {
    const key = user.managerId ?? null;
    const group = groups.get(key) ?? [];
    group.push(user);
    groups.set(key, group);
    return groups;
  }, new Map<string | null, OrgUser[]>());
  const roots = usersByManagerId.get(null) ?? [];
  const missingReviewerCount = users.filter((user) => user.isActive && user.role !== "CEO" && !user.reviewOwnerId && !user.managerId).length;

  return (
    <div className="stack">
      <PageHeader
        title="Organization Import"
        description="Validate and import users, departments, teams, managers, review owners, and employment status from CSV or rows copied from Excel."
      />

      <Card>
        <CardHeader>
          <h2>Import Structure</h2>
          <p>Required columns are name, email, title, role, department, team, primary_manager_email, review_owner_email, and employment_status.</p>
        </CardHeader>
        <CardContent>
          <OrgImportForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2>Organization Tree</h2>
          <p>
            Database-generated reporting relationships for {users.length} users. {missingReviewerCount} active users are missing reviewer configuration.
          </p>
        </CardHeader>
        <CardContent>
          <div className="org-tree">
            {roots.map((user) => (
              <OrgTreeNode key={user.id} user={user} usersByManagerId={usersByManagerId} />
            ))}
            {roots.length === 0 ? <div className="route-item">No root users are available.</div> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
