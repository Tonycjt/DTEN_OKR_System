import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { weeklyReportStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { formatWeekRange } from "@/lib/week";
import { requireRole } from "@/server/auth";
import { prisma } from "@/server/prisma";

export default async function ReviewHistoryPage() {
  const manager = await requireRole(["ADMIN", "CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER"]);

  const reviews = await prisma.managerReview.findMany({
    where: { managerId: manager.id },
    orderBy: { createdAt: "desc" },
    include: {
      weeklyReport: {
        include: {
          user: {
            include: { department: true, team: true },
          },
          _count: {
            select: { weeklyTasks: true, checkIns: true },
          },
        },
      },
    },
  });

  return (
    <div className="stack">
      <PageHeader
        title="Review History"
        description="Reports you have reviewed, including decisions and follow-up context."
      />

      <Card>
        <CardHeader>
          <h2>Completed Reviews</h2>
          <p className="muted">
            {reviews.length} review{reviews.length === 1 ? "" : "s"} submitted by you.
          </p>
        </CardHeader>
        <CardContent>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Week</th>
                  <th>Status</th>
                  <th>Decision</th>
                  <th>Tasks</th>
                  <th>KR Updates</th>
                  <th>Comment</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((review) => (
                  <tr key={review.id}>
                    <td>
                      <strong>{review.weeklyReport.user.name}</strong>
                      <br />
                      <span className="muted">
                        {review.weeklyReport.user.department?.name ?? "No dept"}
                        {review.weeklyReport.user.team ? ` / ${review.weeklyReport.user.team.name}` : ""}
                      </span>
                    </td>
                    <td>{formatWeekRange(review.weeklyReport.weekStart, review.weeklyReport.weekEnd)}</td>
                    <td>
                      <Badge tone={weeklyReportStatusTone(review.weeklyReport.status)}>
                        {formatEnumLabel(review.weeklyReport.status)}
                      </Badge>
                    </td>
                    <td>
                      <Badge
                        tone={
                          review.decision === "APPROVED"
                            ? "success"
                            : review.decision === "NEEDS_FOLLOW_UP"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {formatEnumLabel(review.decision)}
                      </Badge>
                    </td>
                    <td>{review.weeklyReport._count.weeklyTasks}</td>
                    <td>{review.weeklyReport._count.checkIns}</td>
                    <td>{review.comment ?? <span className="muted">—</span>}</td>
                  </tr>
                ))}
                {reviews.length === 0 ? (
                  <tr>
                    <td colSpan={7}>No reviews submitted yet.</td>
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
