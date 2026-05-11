import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatEnumLabel } from "@/lib/format";
import { requireRole } from "@/server/auth";
import { prisma } from "@/server/prisma";

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function summarizeMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "No metadata";
  }

  return Object.entries(metadata)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" / ");
}

export default async function AuditLogPage() {
  await requireRole(["ADMIN", "CEO"]);

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      actor: true,
    },
  });

  return (
    <div className="stack">
      <PageHeader
        title="Audit Log"
        description="Recent Release 1 create, update, submit, and review events across OKRs and weekly reports."
      />

      <Card>
        <CardHeader>
          <h2>Recent Activity</h2>
          <p>Showing the latest 100 audit records.</p>
        </CardHeader>
        <CardContent>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>
                      <strong>{log.actor?.name ?? "System"}</strong>
                      <br />
                      <span className="muted">{log.actor?.email ?? "No actor"}</span>
                    </td>
                    <td>
                      <Badge tone="info">{formatEnumLabel(log.action)}</Badge>
                    </td>
                    <td>
                      <strong>{log.entityType}</strong>
                      <br />
                      <span className="muted">{log.entityId}</span>
                    </td>
                    <td>{summarizeMetadata(log.metadata)}</td>
                  </tr>
                ))}
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No audit log entries exist yet.</td>
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
