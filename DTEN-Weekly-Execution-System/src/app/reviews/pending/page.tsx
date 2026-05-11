import type { ReviewDecision } from "@prisma/client";
import Link from "next/link";
import { submitManagerReviewAction } from "@/app/reviews/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { priorityStatusTone, weeklyReportStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { formatWeekRange } from "@/lib/week";
import { requireRole } from "@/server/auth";
import { prisma } from "@/server/prisma";

const decisions: ReviewDecision[] = ["APPROVED", "NEEDS_FOLLOW_UP", "RISK_FLAGGED"];

export default async function PendingReviewsPage() {
  const manager = await requireRole(["ADMIN", "CEO", "DEPARTMENT_HEAD", "MANAGER"]);
  const canReviewAny = manager.role === "ADMIN" || manager.role === "CEO" || manager.role === "DEPARTMENT_HEAD";

  const reports = await prisma.weeklyReport.findMany({
    where: {
      status: "SUBMITTED",
      ...(canReviewAny ? {} : { user: { managerId: manager.id } }),
    },
    orderBy: [{ weekStart: "desc" }, { submittedAt: "asc" }],
    include: {
      user: {
        include: {
          department: true,
          team: true,
        },
      },
      priorities: {
        orderBy: { createdAt: "asc" },
        include: {
          linkedKeyResult: {
            include: {
              objective: true,
            },
          },
          checkIns: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
      checkIns: {
        include: {
          keyResult: true,
          user: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return (
    <div className="stack">
      <PageHeader title="Pending Reviews" description="Submitted weekly reports waiting for manager review." />

      <div className="stack">
        {reports.map((report) => (
          <Card key={report.id}>
            <CardHeader>
              <div className="table-actions">
                <h2>
                  {report.user.name} / {formatWeekRange(report.weekStart, report.weekEnd)}
                </h2>
                <Badge tone={weeklyReportStatusTone(report.status)}>{formatEnumLabel(report.status)}</Badge>
              </div>
              <p>
                {report.user.department?.name ?? "No department"}
                {report.user.team ? ` / ${report.user.team.name}` : ""} / {report.summary ?? "No summary"}
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-2">
                <div className="stack">
                  <h3>Priorities And Check-ins</h3>
                  <div className="route-grid">
                    {report.priorities.map((priority) => {
                      const checkIn = priority.checkIns[0];

                      return (
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
                              {checkIn ? ` / Check-in: ${checkIn.previousValue} to ${checkIn.newValue}` : " / No check-in"}
                            </span>
                          </span>
                          <Badge tone={priorityStatusTone(priority.status)}>{formatEnumLabel(priority.status)}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <form action={submitManagerReviewAction} className="form-shell">
                  <input name="weeklyReportId" type="hidden" value={report.id} />
                  <label className="field">
                    <span>Decision</span>
                    <select name="decision" required>
                      {decisions.map((decision) => (
                        <option key={decision} value={decision}>
                          {formatEnumLabel(decision)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Manager Comment</span>
                    <textarea name="comment" placeholder="Add review notes, follow-up request, or risk context." />
                  </label>
                  <Button type="submit">Submit Review</Button>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}

        {reports.length === 0 ? (
          <Card>
            <CardContent>No submitted reports are waiting for your review.</CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
