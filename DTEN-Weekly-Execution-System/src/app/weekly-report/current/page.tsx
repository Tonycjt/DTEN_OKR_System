import type { PriorityStatus, PriorityType } from "@prisma/client";
import {
  addWeeklyPriorityAction,
  deleteWeeklyPriorityAction,
  ensureCurrentWeeklyReport,
  submitWeeklyReportAction,
  updateWeeklyPriorityAction,
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

type CurrentWeeklyReportPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

const priorityTypes: PriorityType[] = ["KR_LINKED", "AD_HOC"];
const priorityStatuses: PriorityStatus[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DONE"];

const errorMessages: Record<string, string> = {
  "kr-required": "KR-linked priorities must select a linked KR before saving or submitting.",
  "no-priorities": "Add at least one weekly priority before submitting.",
  submitted: "This report has already been submitted and cannot accept new priorities.",
};

export default async function CurrentWeeklyReportPage({ searchParams }: CurrentWeeklyReportPageProps) {
  const user = await requireUser();
  const report = await ensureCurrentWeeklyReport(user.id);
  const params = searchParams ? await searchParams : {};
  const error = params.error ? errorMessages[params.error] : null;

  const keyResults = await prisma.keyResult.findMany({
    orderBy: [{ objective: { title: "asc" } }, { title: "asc" }],
    include: {
      objective: true,
      owner: true,
    },
  });

  const isSubmitted = report.status === "SUBMITTED" || report.status === "REVIEWED";

  return (
    <div className="stack">
      <PageHeader
        title="Current Weekly Report"
        description={`Draft and submit priorities for ${formatWeekRange(report.weekStart, report.weekEnd)}.`}
      />

      {error ? <div className="alert">{error}</div> : null}

      <div className="grid grid-2">
        <Card>
          <CardHeader>
            <h2>Report Summary</h2>
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
              <Button disabled={isSubmitted} type="submit">
                Save Draft
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2>Add Priority</h2>
            <p>Use KR-linked for OKR work and ad-hoc for work that should not affect OKR progress.</p>
          </CardHeader>
          <CardContent>
            <form action={addWeeklyPriorityAction} className="form-grid">
              <input name="weeklyReportId" type="hidden" value={report.id} />
              <label className="field wide">
                <span>Priority</span>
                <textarea disabled={isSubmitted} name="content" placeholder="Complete Microsoft Teams certification readiness review" required />
              </label>
              <label className="field">
                <span>Type</span>
                <select defaultValue="KR_LINKED" disabled={isSubmitted} name="type" required>
                  {priorityTypes.map((type) => (
                    <option key={type} value={type}>
                      {formatEnumLabel(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Linked KR</span>
                <select disabled={isSubmitted} name="linkedKeyResultId">
                  <option value="">None</option>
                  {keyResults.map((keyResult) => (
                    <option key={keyResult.id} value={keyResult.id}>
                      {keyResult.objective.title} / {keyResult.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field wide">
                <span>Result Summary</span>
                <input disabled={isSubmitted} name="resultSummary" placeholder="What changed this week?" />
              </label>
              <label className="field">
                <span>Blocker</span>
                <input disabled={isSubmitted} name="blocker" placeholder="Optional blocker" />
              </label>
              <label className="field">
                <span>Next Step</span>
                <input disabled={isSubmitted} name="nextStep" placeholder="Next action" />
              </label>
              <div className="wide">
                <Button disabled={isSubmitted} type="submit">
                  Add Priority
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2>Weekly Priorities</h2>
          <p>{report.priorities.length} priorities are attached to this report.</p>
        </CardHeader>
        <CardContent>
          <div className="stack">
            {report.priorities.map((priority) => (
              <form action={updateWeeklyPriorityAction} className="card" key={priority.id}>
                <div className="card-content">
                  <input name="priorityId" type="hidden" value={priority.id} />
                  <div className="form-grid">
                    <label className="field wide">
                      <span>Priority</span>
                      <textarea defaultValue={priority.content} disabled={isSubmitted} name="content" required />
                    </label>
                    <label className="field">
                      <span>Type</span>
                      <select defaultValue={priority.type} disabled={isSubmitted} name="type" required>
                        {priorityTypes.map((type) => (
                          <option key={type} value={type}>
                            {formatEnumLabel(type)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Status</span>
                      <select defaultValue={priority.status} disabled={isSubmitted} name="status" required>
                        {priorityStatuses.map((status) => (
                          <option key={status} value={status}>
                            {formatEnumLabel(status)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field wide">
                      <span>Linked KR</span>
                      <select defaultValue={priority.linkedKeyResultId ?? ""} disabled={isSubmitted} name="linkedKeyResultId">
                        <option value="">None</option>
                        {keyResults.map((keyResult) => (
                          <option key={keyResult.id} value={keyResult.id}>
                            {keyResult.objective.title} / {keyResult.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field wide">
                      <span>Result Summary</span>
                      <input defaultValue={priority.resultSummary ?? ""} disabled={isSubmitted} name="resultSummary" />
                    </label>
                    <label className="field">
                      <span>Blocker</span>
                      <input defaultValue={priority.blocker ?? ""} disabled={isSubmitted} name="blocker" />
                    </label>
                    <label className="field">
                      <span>Next Step</span>
                      <input defaultValue={priority.nextStep ?? ""} disabled={isSubmitted} name="nextStep" />
                    </label>
                  </div>
                  <div className="table-actions">
                    <Badge tone={priorityStatusTone(priority.status)}>{formatEnumLabel(priority.status)}</Badge>
                    {priority.linkedKeyResult ? (
                      <Badge tone="info">{priority.linkedKeyResult.title}</Badge>
                    ) : (
                      <Badge tone="neutral">No KR link</Badge>
                    )}
                    <Button disabled={isSubmitted} type="submit">
                      Update
                    </Button>
                    <button
                      className="button button-secondary"
                      disabled={isSubmitted}
                      formAction={deleteWeeklyPriorityAction}
                      type="submit"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </form>
            ))}
            {report.priorities.length === 0 ? <div className="route-item">No weekly priorities yet.</div> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2>Submit Report</h2>
          <p>Submitting sends the report to your manager and locks the current draft for review.</p>
        </CardHeader>
        <CardContent>
          <form action={submitWeeklyReportAction} className="table-actions">
            <input name="weeklyReportId" type="hidden" value={report.id} />
            <input name="summary" type="hidden" value={report.summary ?? ""} />
            <Button disabled={isSubmitted} type="submit">
              Submit Weekly Report
            </Button>
            {isSubmitted ? <span className="muted">This report has already been submitted.</span> : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
