import type { ReviewDecision } from "@prisma/client";
import Link from "next/link";
import { addWeeklyReportCommentAction } from "@/app/comments/actions";
import { createFollowUpAction } from "@/app/follow-ups/actions";
import { submitManagerReviewAction } from "@/app/reviews/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { weeklyReportStatusTone, weeklyTaskStatusTone, workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { reviewQueueWhere } from "@/lib/review-routing";
import { formatWeekRange } from "@/lib/week";
import { requireRole } from "@/server/auth";
import { prisma } from "@/server/prisma";

const decisions: ReviewDecision[] = ["APPROVED", "NEEDS_FOLLOW_UP", "RISK_FLAGGED"];

export default async function PendingReviewsPage() {
  const manager = await requireRole(["ADMIN", "CEO", "EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER"]);

  const reports = await prisma.weeklyReport.findMany({
    where: {
      status: "SUBMITTED",
      ...(manager.role === "ADMIN" ? {} : reviewQueueWhere(manager.id)),
    },
    orderBy: [{ weekStart: "desc" }, { submittedAt: "asc" }],
    include: {
      user: {
        include: { department: true, team: true },
      },
      weeklyTasks: {
        orderBy: [{ sectionType: "asc" }, { createdAt: "asc" }],
      },
      checkIns: {
        include: {
          keyResult: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true } } },
      },
    },
  });

  return (
    <div className="stack">
      <PageHeader title="Pending Reviews" description="Submitted weekly reports routed to you for review." />

      <div className="stack">
        {reports.map((report) => {
          const thisWeekTasks = report.weeklyTasks.filter((t) => t.sectionType === "THIS_WEEK");
          const nextWeekTasks = report.weeklyTasks.filter((t) => t.sectionType === "NEXT_WEEK");

          return (
            <Card key={report.id}>
              <CardHeader>
                <div className="table-actions">
                  <h2>
                    {report.user.name} — {formatWeekRange(report.weekStart, report.weekEnd)}
                  </h2>
                  <Badge tone={weeklyReportStatusTone(report.status)}>{formatEnumLabel(report.status)}</Badge>
                </div>
                <p className="muted">
                  {report.user.department?.name ?? "No department"}
                  {report.user.team ? ` / ${report.user.team.name}` : ""}
                  {report.summary ? ` · ${report.summary}` : ""}
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-2">
                  {/* Left column: tasks + KR updates */}
                  <div className="stack">
                    {thisWeekTasks.length > 0 ? (
                      <>
                        <h3>This Week&apos;s Tasks</h3>
                        <div className="history-task-list">
                          {thisWeekTasks.map((task) => (
                            <div key={task.id} className="history-task">
                              <div className="history-task-header">
                                <span className="history-task-content">{task.content}</span>
                                <Badge tone={weeklyTaskStatusTone(task.status as Parameters<typeof weeklyTaskStatusTone>[0])}>
                                  {formatEnumLabel(task.status)}
                                </Badge>
                              </div>
                              <div className="history-task-progress">
                                <ProgressBar value={task.progressPercent} />
                                <span className="muted">{task.progressPercent}%</span>
                              </div>
                              {task.blocker ? <p className="muted notice-danger-inline">Blocker: {task.blocker}</p> : null}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}

                    {nextWeekTasks.length > 0 ? (
                      <>
                        <h3>Next Week&apos;s Plans</h3>
                        <div className="history-task-list">
                          {nextWeekTasks.map((task) => (
                            <div key={task.id} className="history-task">
                              <div className="history-task-header">
                                <span className="history-task-content">{task.content}</span>
                                <Badge tone={weeklyTaskStatusTone(task.status as Parameters<typeof weeklyTaskStatusTone>[0])}>
                                  {formatEnumLabel(task.status)}
                                </Badge>
                              </div>
                              <div className="history-task-progress">
                                <ProgressBar value={task.progressPercent} />
                                <span className="muted">{task.progressPercent}%</span>
                              </div>
                              {task.blocker ? <p className="muted notice-danger-inline">Blocker: {task.blocker}</p> : null}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}

                    {thisWeekTasks.length === 0 && nextWeekTasks.length === 0 ? (
                      <p className="muted">No tasks recorded this week.</p>
                    ) : null}

                    {report.checkIns.length > 0 ? (
                      <>
                        <h3>KR Updates</h3>
                        {report.checkIns.map((ci) => (
                          <div key={ci.id} className="history-kr-update">
                            <p className="history-section-title">
                              <Link href={`/key-results/${ci.keyResult.id}`} className="link">
                                {ci.keyResult.title}
                              </Link>
                            </p>
                            <div className="history-kr-update-values">
                              <span>
                                <strong>{ci.previousValue}</strong> → <strong>{ci.newValue}</strong>
                              </span>
                              <span className="muted">{ci.progressPercent}% progress</span>
                              <Badge tone={workStatusTone(ci.status as Parameters<typeof workStatusTone>[0])}>
                                {formatEnumLabel(ci.status)}
                              </Badge>
                              <span className="muted">Confidence: {ci.confidenceScore}/5</span>
                            </div>
                            {ci.note ? <p className="muted">Note: {ci.note}</p> : null}
                            {ci.blocker ? <p className="muted notice-danger-inline">Blocker: {ci.blocker}</p> : null}
                          </div>
                        ))}
                      </>
                    ) : (
                      <p className="muted">No KR updates this week.</p>
                    )}
                  </div>

                  {/* Right column: review form + follow-up + comments */}
                  <div className="stack">
                    <form action={submitManagerReviewAction} className="form-shell">
                      <input name="weeklyReportId" type="hidden" value={report.id} />
                      <h3>Submit Review</h3>
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
                        <span>Comment</span>
                        <textarea name="comment" placeholder="Add review notes, follow-up request, or risk context." />
                      </label>
                      <Button type="submit">Submit Review</Button>
                    </form>

                    <form action={createFollowUpAction} className="form-shell">
                      <input name="sourceObjectType" type="hidden" value="WEEKLY_REPORT" />
                      <input name="sourceObjectId" type="hidden" value={report.id} />
                      <input name="ownerId" type="hidden" value={report.userId} />
                      <input name="redirectPath" type="hidden" value="/reviews/pending" />
                      <h3>Assign Follow-up</h3>
                      <label className="field">
                        <textarea name="content" placeholder="Specific next action for this report." required />
                      </label>
                      <label className="field">
                        <span>Due Date</span>
                        <input name="dueDate" type="date" />
                      </label>
                      <Button tone="secondary" type="submit">
                        Assign Follow-up
                      </Button>
                    </form>

                    <div className="stack">
                      <h3>Comments</h3>
                      <form action={addWeeklyReportCommentAction} className="form-shell">
                        <input name="weeklyReportId" type="hidden" value={report.id} />
                        <input name="redirectPath" type="hidden" value="/reviews/pending" />
                        <label className="field">
                          <textarea name="body" placeholder="Ask a follow-up question or add review context." required />
                        </label>
                        <Button tone="secondary" type="submit">
                          Add Comment
                        </Button>
                      </form>
                      {report.comments.length > 0 ? (
                        <div className="history-comments">
                          {report.comments.map((c) => (
                            <div key={c.id} className="history-comment">
                              <strong>{c.author.name}:</strong> <span className="muted">{c.body}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {reports.length === 0 ? (
          <Card>
            <CardContent>No submitted reports are waiting for your review.</CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
