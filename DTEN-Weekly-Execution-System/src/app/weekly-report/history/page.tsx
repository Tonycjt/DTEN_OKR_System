import Link from "next/link";
import { addWeeklyReportCommentAction } from "@/app/comments/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { priorityStatusTone, weeklyReportStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { formatWeekRange } from "@/lib/week";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

export default async function WeeklyReportHistoryPage() {
  const user = await requireUser();

  const reports = await prisma.weeklyReport.findMany({
    where: { userId: user.id },
    orderBy: { weekStart: "desc" },
    include: {
      priorities: {
        orderBy: { createdAt: "asc" },
        include: {
          linkedKeyResult: {
            include: {
              objective: true,
            },
          },
        },
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        include: {
          manager: true,
        },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          author: true,
        },
      },
    },
  });

  return (
    <div className="stack">
      <PageHeader
        title="Weekly Report History"
        description={`Submitted, reviewed, follow-up, and draft weekly reports for ${user.name}.`}
      />

      <div className="stack">
        {reports.map((report) => (
          <Card key={report.id}>
            <CardHeader>
              <div className="table-actions">
                <h2>{formatWeekRange(report.weekStart, report.weekEnd)}</h2>
                <Badge tone={weeklyReportStatusTone(report.status)}>{formatEnumLabel(report.status)}</Badge>
              </div>
              <p>{report.summary ?? "No report summary saved."}</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-2">
                <div className="stack">
                  <h3>Priorities</h3>
                  <div className="route-grid">
                    {report.priorities.map((priority) => (
                      <div className="route-item" key={priority.id}>
                        <span>
                          <strong>{priority.content}</strong>
                          <br />
                          <span className="muted">
                            {priority.linkedKeyResult ? (
                              <>
                                KR:{" "}
                                <Link href={`/key-results/${priority.linkedKeyResult.id}`}>
                                  {priority.linkedKeyResult.title}
                                </Link>
                              </>
                            ) : (
                              "Ad-hoc"
                            )}
                          </span>
                        </span>
                        <Badge tone={priorityStatusTone(priority.status)}>{formatEnumLabel(priority.status)}</Badge>
                      </div>
                    ))}
                    {report.priorities.length === 0 ? <div className="route-item">No priorities saved.</div> : null}
                  </div>
                </div>

                <div className="stack">
                  <h3>Review Result</h3>
                  <div className="route-grid">
                    {report.reviews.map((review) => (
                      <div className="route-item" key={review.id}>
                        <span>
                          <strong>{formatEnumLabel(review.decision)}</strong>
                          <br />
                          <span className="muted">
                            {review.manager.name}: {review.comment ?? "No comment"}
                          </span>
                        </span>
                      </div>
                    ))}
                    {report.reviews.length === 0 ? <div className="route-item">No manager review yet.</div> : null}
                  </div>
                </div>
              </div>

              <div className="check-in-panel stack">
                <h3>Report Comments</h3>
                <form action={addWeeklyReportCommentAction} className="form-shell">
                  <input name="weeklyReportId" type="hidden" value={report.id} />
                  <input name="redirectPath" type="hidden" value="/weekly-report/history" />
                  <label className="field">
                    <span>Add Comment</span>
                    <textarea name="body" placeholder="Reply to manager feedback or add clarification." required />
                  </label>
                  <Button tone="secondary" type="submit">
                    Add Comment
                  </Button>
                </form>
                <div className="route-grid">
                  {report.comments.map((comment) => (
                    <div className="route-item" key={comment.id}>
                      <span>
                        <strong>{comment.author.name}</strong>
                        <br />
                        <span className="muted">{comment.body}</span>
                      </span>
                    </div>
                  ))}
                  {report.comments.length === 0 ? <div className="route-item">No report comments yet.</div> : null}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {reports.length === 0 ? (
          <Card>
            <CardContent>No weekly reports exist yet. Open the current weekly report to create one.</CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
