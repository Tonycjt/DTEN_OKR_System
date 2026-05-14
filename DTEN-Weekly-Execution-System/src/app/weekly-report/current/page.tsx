import type { PriorityStatus } from "@prisma/client";
import Link from "next/link";
import {
  ensureCurrentWeeklyReport,
  saveReportPriorityAction,
  savePriorityCheckInAction,
  submitWeeklyReportAction,
  updateWeeklyReportSummaryAction,
} from "@/app/weekly-report/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { priorityStatusTone, weeklyReportStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { formatWeekRange } from "@/lib/week";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";
import type { WorkStatus } from "@prisma/client";

type CurrentWeeklyReportPageProps = {
  searchParams?: Promise<{ error?: string }>;
};

const priorityStatuses: PriorityStatus[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DONE"];
const workStatuses: WorkStatus[] = ["ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETED", "ON_HOLD"];

const errorMessages: Record<string, string> = {
  "kr-required": "KR-linked priorities must select a linked KR before saving or submitting.",
  "kr-not-assigned": "That KR is not assigned to you.",
  "no-priorities": "Add at least one weekly priority before submitting.",
  "submitted": "This report has already been submitted and cannot be modified.",
  "no-report": "Priority is not linked to this report yet. Please reload the page.",
};

export default async function CurrentWeeklyReportPage({ searchParams }: CurrentWeeklyReportPageProps) {
  const user = await requireUser();
  const report = await ensureCurrentWeeklyReport(user.id);
  const params = searchParams ? await searchParams : {};
  const error = params.error ? errorMessages[params.error] : null;

  const existingLinkedKrIds = Array.from(
    new Set(report.priorities.map((p) => p.linkedKeyResultId).filter((id): id is string => Boolean(id)))
  );

  const keyResults = await prisma.keyResult.findMany({
    where: { OR: [{ ownerId: user.id }, { id: { in: existingLinkedKrIds } }] },
    orderBy: [{ objective: { title: "asc" } }, { title: "asc" }],
    include: { objective: true, owner: true },
  });
  const assignedKeyResults = keyResults.filter((kr) => kr.ownerId === user.id);

  const isSubmitted = report.status === "SUBMITTED" || report.status === "REVIEWED";
  const krLinkedPriorities = report.priorities.filter((p) => p.type === "KR_LINKED" && p.linkedKeyResult);

  return (
    <div className="stack">
      <PageHeader
        title="Weekly Report"
        description={`Report your execution for ${formatWeekRange(report.weekStart, report.weekEnd)}.`}
      />

      {error ? <div className="alert">{error}</div> : null}

      {/* ── SECTION 1: PLAN ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2>Plan</h2>
          <p>
            Your planned priorities for this week.{" "}
            {!isSubmitted ? (
              <Link href="/weekly-plan" style={{ color: "var(--color-primary)" }}>
                Edit in Weekly Plan →
              </Link>
            ) : null}
          </p>
        </CardHeader>
        <CardContent>
          {report.priorities.length === 0 ? (
            <div className="route-item">
              No priorities planned yet.{" "}
              {!isSubmitted ? (
                <Link href="/weekly-plan">Go to Weekly Plan to add priorities.</Link>
              ) : null}
            </div>
          ) : (
            <div className="stack">
              {report.priorities.map((priority) => (
                <div className="card" key={priority.id} style={{ background: "var(--color-surface-subtle, #f8f9fa)" }}>
                  <div className="card-content">
                    <div className="table-actions">
                      <Badge tone={priority.type === "KR_LINKED" ? "info" : "neutral"}>{formatEnumLabel(priority.type)}</Badge>
                      {priority.carriedOverFromId ? <Badge tone="neutral">Carried over</Badge> : null}
                      {priority.linkedKeyResult ? (
                        <Badge tone="info">{priority.linkedKeyResult.title}</Badge>
                      ) : null}
                    </div>
                    <p style={{ marginTop: "0.25rem" }}>{priority.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── SECTION 2: REPORT ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2>Report</h2>
          <p>Update the status, result, and blockers for each planned priority.</p>
        </CardHeader>
        <CardContent>
          <div className="stack">
            {report.priorities.length === 0 ? (
              <div className="route-item">No priorities to report on. Add priorities in Weekly Plan first.</div>
            ) : null}
            {report.priorities.map((priority) => {
              const selectableKrs =
                priority.linkedKeyResult && !assignedKeyResults.some((kr) => kr.id === priority.linkedKeyResultId)
                  ? [...assignedKeyResults, priority.linkedKeyResult]
                  : assignedKeyResults;

              return (
                <div className="card" key={priority.id}>
                  <div className="card-content">
                    <div className="table-actions" style={{ marginBottom: "0.5rem" }}>
                      <Badge tone={priorityStatusTone(priority.status)}>{formatEnumLabel(priority.status)}</Badge>
                      <strong>{priority.content}</strong>
                    </div>
                    <form action={saveReportPriorityAction} className="form-grid">
                      <input name="priorityId" type="hidden" value={priority.id} />
                      <label className="field">
                        <span>Status</span>
                        <select defaultValue={priority.status} disabled={isSubmitted} name="status" required>
                          {priorityStatuses.map((s) => (
                            <option key={s} value={s}>{formatEnumLabel(s)}</option>
                          ))}
                        </select>
                      </label>
                      <label className="field wide">
                        <span>Result Summary</span>
                        <input
                          defaultValue={priority.resultSummary ?? ""}
                          disabled={isSubmitted}
                          name="resultSummary"
                          placeholder="What actually happened this week?"
                        />
                      </label>
                      <label className="field">
                        <span>Blocker</span>
                        <input defaultValue={priority.blocker ?? ""} disabled={isSubmitted} name="blocker" placeholder="Any blockers?" />
                      </label>
                      <label className="field">
                        <span>Next Step</span>
                        <input defaultValue={priority.nextStep ?? ""} disabled={isSubmitted} name="nextStep" placeholder="Next action" />
                      </label>
                      {priority.type === "KR_LINKED" ? (
                        <label className="field wide">
                          <span>Linked KR</span>
                          <select defaultValue={priority.linkedKeyResultId ?? ""} disabled={isSubmitted} name="linkedKeyResultId">
                            <option value="">None</option>
                            {selectableKrs.map((kr) => (
                              <option key={kr.id} value={kr.id}>{kr.objective.title} / {kr.title}</option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <div className="wide">
                        <Button disabled={isSubmitted} type="submit">Save</Button>
                      </div>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── SECTION 3: KR CHECK-INS ──────────────────────────────────────── */}
      {krLinkedPriorities.length > 0 ? (
        <Card>
          <CardHeader>
            <h2>KR Check-ins</h2>
            <p>Update measurable KR progress for each KR-linked priority. Check-ins are required to move KR progress.</p>
          </CardHeader>
          <CardContent>
            <div className="stack">
              {krLinkedPriorities.map((priority) => {
                const kr = priority.linkedKeyResult!;
                const latestCheckIn = priority.checkIns[0];

                return (
                  <div className="card" key={priority.id}>
                    <div className="card-content">
                      <div className="table-actions" style={{ marginBottom: "0.5rem" }}>
                        <strong>{kr.title}</strong>
                        <span className="muted">via: {priority.content}</span>
                      </div>
                      <p className="muted" style={{ marginBottom: "0.75rem" }}>
                        Current value: {kr.currentValue} / {kr.targetValue} ({Math.round(kr.progressPercent)}%)
                      </p>
                      <form action={savePriorityCheckInAction} className="form-grid check-in-panel">
                        <input name="priorityId" type="hidden" value={priority.id} />
                        <label className="field">
                          <span>New Value</span>
                          <input
                            defaultValue={latestCheckIn?.newValue ?? kr.currentValue}
                            disabled={isSubmitted}
                            name="newValue"
                            type="number"
                          />
                        </label>
                        <label className="field">
                          <span>KR Status</span>
                          <select defaultValue={latestCheckIn?.status ?? kr.status} disabled={isSubmitted} name="status">
                            {workStatuses.map((s) => (
                              <option key={s} value={s}>{formatEnumLabel(s)}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Confidence (1–5)</span>
                          <input
                            defaultValue={latestCheckIn?.confidenceScore ?? kr.confidenceScore}
                            disabled={isSubmitted}
                            max="5"
                            min="1"
                            name="confidenceScore"
                            type="number"
                          />
                        </label>
                        <label className="field">
                          <span>Blocker</span>
                          <input defaultValue={latestCheckIn?.blocker ?? priority.blocker ?? ""} disabled={isSubmitted} name="blocker" />
                        </label>
                        <label className="field wide">
                          <span>Check-in Note</span>
                          <textarea defaultValue={latestCheckIn?.note ?? ""} disabled={isSubmitted} name="note" />
                        </label>
                        <div className="wide table-actions">
                          <Button disabled={isSubmitted} type="submit">Save Check-in</Button>
                          {latestCheckIn ? <Badge tone="success">Check-in saved</Badge> : <Badge tone="neutral">No check-in yet</Badge>}
                        </div>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ── SECTION 4: SUMMARY & SUBMIT ──────────────────────────────────── */}
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
