import type { WeeklyTaskStatus, WorkStatus } from "@prisma/client";
import Link from "next/link";
import {
  createWeeklyTaskAction,
  deleteWeeklyTaskAction,
  ensureCurrentWeeklyReport,
  saveKrUpdateAction,
  submitWeeklyReportAction,
  updateWeeklyReportSummaryAction,
  updateWeeklyTaskAction,
} from "@/app/weekly-report/actions";
import { addWeeklyReportCommentAction } from "@/app/comments/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { weeklyReportStatusTone, workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { getCurrentQuarterMonthIndex } from "@/lib/okr-calculations";
import { formatWeekRange } from "@/lib/week";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

type CurrentWeeklyReportPageProps = {
  searchParams?: Promise<{ error?: string }>;
};

const workStatuses: WorkStatus[] = ["ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETED", "ON_HOLD"];
const weeklyTaskStatuses: WeeklyTaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "BLOCKED", "CANCELLED"];

const errorMessages: Record<string, string> = {
  submitted: "This report has already been submitted and cannot be modified.",
  "task-limit": "Each section can hold at most 3 tasks.",
};

export default async function CurrentWeeklyReportPage({ searchParams }: CurrentWeeklyReportPageProps) {
  const user = await requireUser();
  const report = await ensureCurrentWeeklyReport(user.id);
  const params = searchParams ? await searchParams : {};
  const error = params.error ? (errorMessages[params.error] ?? params.error) : null;

  const currentMonthIndex = getCurrentQuarterMonthIndex();

  const userKeyResults = await prisma.keyResult.findMany({
    where: { ownerId: user.id },
    orderBy: [{ objective: { title: "asc" } }, { title: "asc" }],
    include: {
      objective: { select: { id: true, title: true } },
      monthlyTargets: { orderBy: { monthIndex: "asc" } },
      checkIns: {
        where: { weeklyReportId: report.id, userId: user.id, weeklyPriorityId: null },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const isSubmitted = report.status === "SUBMITTED" || report.status === "REVIEWED";

  const thisWeekTasks = report.weeklyTasks.filter((t) => t.sectionType === "THIS_WEEK");
  const nextWeekTasks = report.weeklyTasks.filter((t) => t.sectionType === "NEXT_WEEK");

  return (
    <div className="stack">
      <PageHeader
        title="Weekly Report"
        description={`Report your execution for ${formatWeekRange(report.weekStart, report.weekEnd)}.`}
      />

      {error ? <div className="alert">{error}</div> : null}

      {/* ── SECTION 1: THIS WEEK'S TASKS ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2>This Week&apos;s Tasks</h2>
          <p>{thisWeekTasks.length}/3 tasks · Record what you worked on this week.</p>
        </CardHeader>
        <CardContent>
          <div className="stack">
            {thisWeekTasks.map((task) => (
              <div className="card" key={task.id}>
                <div className="card-content">
                  <form action={updateWeeklyTaskAction} className="form-grid">
                    <input name="taskId" type="hidden" value={task.id} />
                    <label className="field wide">
                      <span>Task</span>
                      <input defaultValue={task.content} disabled={isSubmitted} name="content" required />
                    </label>
                    <label className="field">
                      <span>Status</span>
                      <select defaultValue={task.status} disabled={isSubmitted} name="status">
                        {weeklyTaskStatuses.map((s) => (
                          <option key={s} value={s}>{formatEnumLabel(s)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Progress</span>
                      <select
                        defaultValue={String(Math.round(task.progressPercent / 25) * 25)}
                        disabled={isSubmitted}
                        name="progressPercent"
                      >
                        {[0, 25, 50, 75, 100].map((v) => (
                          <option key={v} value={v}>{v}%</option>
                        ))}
                      </select>
                    </label>
                    <label className="field wide">
                      <span>Blocker</span>
                      <input defaultValue={task.blocker ?? ""} disabled={isSubmitted} name="blocker" placeholder="Any blocker?" />
                    </label>
                    <div className="wide table-actions">
                      <Button disabled={isSubmitted} type="submit">Save</Button>
                      <ProgressBar value={task.progressPercent} />
                    </div>
                  </form>
                  {!isSubmitted ? (
                    <form action={deleteWeeklyTaskAction} style={{ marginTop: "0.5rem" }}>
                      <input name="taskId" type="hidden" value={task.id} />
                      <Button tone="secondary" type="submit">Delete</Button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}

            {!isSubmitted && thisWeekTasks.length < 3 ? (
              <form action={createWeeklyTaskAction} className="form-shell">
                <input name="weeklyReportId" type="hidden" value={report.id} />
                <input name="sectionType" type="hidden" value="THIS_WEEK" />
                <label className="field">
                  <span>Add Task</span>
                  <input name="content" placeholder="What did you work on this week?" required />
                </label>
                <Button type="submit">Add Task</Button>
              </form>
            ) : null}

            {thisWeekTasks.length === 0 && isSubmitted ? (
              <p className="muted">No tasks were recorded for this week.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* ── SECTION 2: NEXT WEEK'S TASKS ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2>Next Week&apos;s Tasks</h2>
          <p>{nextWeekTasks.length}/3 tasks · Plan what you intend to work on next week.</p>
        </CardHeader>
        <CardContent>
          <div className="stack">
            {nextWeekTasks.map((task) => (
              <div className="card" key={task.id}>
                <div className="card-content">
                  <form action={updateWeeklyTaskAction} className="form-grid">
                    <input name="taskId" type="hidden" value={task.id} />
                    <label className="field wide">
                      <span>Task</span>
                      <input defaultValue={task.content} disabled={isSubmitted} name="content" required />
                    </label>
                    <label className="field">
                      <span>Status</span>
                      <select defaultValue={task.status} disabled={isSubmitted} name="status">
                        {weeklyTaskStatuses.map((s) => (
                          <option key={s} value={s}>{formatEnumLabel(s)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Progress</span>
                      <select
                        defaultValue={String(Math.round(task.progressPercent / 25) * 25)}
                        disabled={isSubmitted}
                        name="progressPercent"
                      >
                        {[0, 25, 50, 75, 100].map((v) => (
                          <option key={v} value={v}>{v}%</option>
                        ))}
                      </select>
                    </label>
                    <div className="wide">
                      <Button disabled={isSubmitted} type="submit">Save</Button>
                    </div>
                  </form>
                  {!isSubmitted ? (
                    <form action={deleteWeeklyTaskAction} style={{ marginTop: "0.5rem" }}>
                      <input name="taskId" type="hidden" value={task.id} />
                      <Button tone="secondary" type="submit">Delete</Button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}

            {!isSubmitted && nextWeekTasks.length < 3 ? (
              <form action={createWeeklyTaskAction} className="form-shell">
                <input name="weeklyReportId" type="hidden" value={report.id} />
                <input name="sectionType" type="hidden" value="NEXT_WEEK" />
                <label className="field">
                  <span>Add Task</span>
                  <input name="content" placeholder="What do you plan to work on next week?" required />
                </label>
                <Button type="submit">Add Task</Button>
              </form>
            ) : null}

            {nextWeekTasks.length === 0 && isSubmitted ? (
              <p className="muted">No next-week tasks were planned.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* ── SECTION 3: KR UPDATES ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2>KR Updates</h2>
          <p>Update measurable progress on your key results for this week. Month {currentMonthIndex} targets shown.</p>
        </CardHeader>
        <CardContent>
          {userKeyResults.length === 0 ? (
            <div className="route-item">
              You have no KRs assigned. KRs are created under objectives — visit{" "}
              <Link href="/my-okrs">My OKRs</Link> to see your objectives.
            </div>
          ) : (
            <div className="stack">
              {userKeyResults.map((kr) => {
                const checkIn = kr.checkIns[0];
                const currentTarget = kr.monthlyTargets.find((t) => t.monthIndex === currentMonthIndex);

                return (
                  <div className="card" key={kr.id}>
                    <div className="card-content">
                      <div className="table-actions" style={{ marginBottom: "0.5rem" }}>
                        <span>
                          <Link href={`/key-results/${kr.id}`}>
                            <strong>{kr.title}</strong>
                          </Link>
                          <br />
                          <span className="muted">
                            {kr.objective.title} · {kr.currentValue} / {kr.targetValue} ({Math.round(kr.progressPercent)}%)
                            {currentTarget ? ` · M${currentMonthIndex} target: ${currentTarget.targetPercent ?? 0}%` : ""}
                          </span>
                        </span>
                        <Badge tone={workStatusTone(kr.status)}>{formatEnumLabel(kr.status)}</Badge>
                      </div>
                      <ProgressBar value={kr.progressPercent} />

                      <form action={saveKrUpdateAction} className="form-grid" style={{ marginTop: "0.75rem" }}>
                        <input name="weeklyReportId" type="hidden" value={report.id} />
                        <input name="keyResultId" type="hidden" value={kr.id} />
                        <label className="field">
                          <span>New Value</span>
                          <input
                            defaultValue={checkIn?.newValue ?? kr.currentValue}
                            disabled={isSubmitted}
                            name="newValue"
                            type="number"
                          />
                        </label>
                        <label className="field">
                          <span>Status</span>
                          <select defaultValue={checkIn?.status ?? kr.status} disabled={isSubmitted} name="status">
                            {workStatuses.map((s) => (
                              <option key={s} value={s}>{formatEnumLabel(s)}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Confidence (1–5)</span>
                          <input
                            defaultValue={checkIn?.confidenceScore ?? kr.confidenceScore}
                            disabled={isSubmitted}
                            max="5"
                            min="1"
                            name="confidenceScore"
                            type="number"
                          />
                        </label>
                        <label className="field">
                          <span>Blocker</span>
                          <input defaultValue={checkIn?.blocker ?? ""} disabled={isSubmitted} name="blocker" placeholder="Any blocker?" />
                        </label>
                        <label className="field wide">
                          <span>Note</span>
                          <textarea defaultValue={checkIn?.note ?? ""} disabled={isSubmitted} name="note" placeholder="Context for this week's progress." />
                        </label>
                        <div className="wide table-actions">
                          <Button disabled={isSubmitted} type="submit">Save Update</Button>
                          {checkIn ? <Badge tone="success">Updated this week</Badge> : <Badge tone="neutral">No update yet</Badge>}
                        </div>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── SECTION 4: COMMENTS ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2>Comments</h2>
          <p>{report.comments.length} comment{report.comments.length !== 1 ? "s" : ""} — employee and manager communication.</p>
        </CardHeader>
        <CardContent>
          <div className="stack">
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
              {report.comments.length === 0 ? <div className="route-item">No comments yet.</div> : null}
            </div>

            <form action={addWeeklyReportCommentAction} className="form-shell">
              <input name="weeklyReportId" type="hidden" value={report.id} />
              <input name="redirectPath" type="hidden" value="/weekly-report/current" />
              <label className="field">
                <span>Add Comment</span>
                <textarea name="body" placeholder="Add context, questions, or feedback for this report." required />
              </label>
              <Button type="submit">Add Comment</Button>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* ── SECTION 5: SUMMARY & SUBMIT ──────────────────────────────────── */}
      <div className="grid grid-2">
        <Card>
          <CardHeader>
            <h2>Weekly Summary</h2>
            <p>
              Status: <Badge tone={weeklyReportStatusTone(report.status)}>{formatEnumLabel(report.status)}</Badge>
            </p>
          </CardHeader>
          <CardContent>
            <form action={updateWeeklyReportSummaryAction} className="form-shell">
              <input name="weeklyReportId" type="hidden" value={report.id} />
              <label className="field">
                <span>Summary</span>
                <textarea
                  defaultValue={report.summary ?? ""}
                  disabled={isSubmitted}
                  name="summary"
                  placeholder="Summarize this week's execution focus, progress, and risks."
                />
              </label>
              <Button disabled={isSubmitted} type="submit">Save Draft</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2>Submit Report</h2>
            <p>Submitting sends the report to your manager and locks it for review.</p>
          </CardHeader>
          <CardContent>
            <form action={submitWeeklyReportAction} className="table-actions">
              <input name="weeklyReportId" type="hidden" value={report.id} />
              <input name="summary" type="hidden" value={report.summary ?? ""} />
              <Button disabled={isSubmitted} type="submit">Submit Weekly Report</Button>
              {isSubmitted ? <span className="muted">This report has already been submitted.</span> : null}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
