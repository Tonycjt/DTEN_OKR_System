import type { PriorityStatus, PriorityType } from "@prisma/client";
import {
  addWeeklyPriorityAction,
  deleteWeeklyPriorityAction,
  ensureCurrentWeeklyReport,
  savePriorityCheckInAction,
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
import type { WorkStatus } from "@prisma/client";

type CurrentWeeklyReportPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

const priorityTypes: PriorityType[] = ["KR_LINKED", "AD_HOC"];
const priorityStatuses: PriorityStatus[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DONE"];
const workStatuses: WorkStatus[] = ["ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETED", "ON_HOLD"];

const errorMessages: Record<string, string> = {
  "kr-required": "KR-linked priorities must select a linked KR before saving or submitting.",
  "kr-not-assigned": "That KR is not assigned to you, so it cannot be linked to your weekly report.",
  "no-priorities": "Add at least one weekly priority before submitting.",
  submitted: "This report has already been submitted and cannot accept new priorities.",
};

export default async function CurrentWeeklyReportPage({ searchParams }: CurrentWeeklyReportPageProps) {
  const user = await requireUser();
  const report = await ensureCurrentWeeklyReport(user.id);
  const params = searchParams ? await searchParams : {};
  const error = params.error ? errorMessages[params.error] : null;

  const existingLinkedKrIds = Array.from(
    new Set(report.priorities.map((priority) => priority.linkedKeyResultId).filter((linkedKeyResultId): linkedKeyResultId is string => Boolean(linkedKeyResultId)))
  );

  const keyResults = await prisma.keyResult.findMany({
    where: {
      OR: [{ ownerId: user.id }, { id: { in: existingLinkedKrIds } }],
    },
    orderBy: [{ objective: { title: "asc" } }, { title: "asc" }],
    include: {
      objective: true,
      owner: true,
    },
  });
  const assignedKeyResults = keyResults.filter((keyResult) => keyResult.ownerId === user.id);

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
            <p>KR-linked priorities show KRs assigned to you. Use ad-hoc for work that should not affect OKR progress.</p>
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
                  {assignedKeyResults.map((keyResult) => (
                    <option key={keyResult.id} value={keyResult.id}>
                      {keyResult.objective.title} / {keyResult.title}
                    </option>
                  ))}
                </select>
                {assignedKeyResults.length === 0 ? <small>No assigned KRs are available for your weekly report.</small> : null}
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
            {report.priorities.map((priority) => {
              const latestCheckIn = priority.checkIns[0];
              const prioritySelectableKeyResults =
                priority.linkedKeyResult && !assignedKeyResults.some((keyResult) => keyResult.id === priority.linkedKeyResultId)
                  ? [...assignedKeyResults, priority.linkedKeyResult]
                  : assignedKeyResults;

              return (
              <div className="card" key={priority.id}>
                <div className="card-content">
                  <form action={updateWeeklyPriorityAction} className="stack">
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
                          {prioritySelectableKeyResults.map((keyResult) => (
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
                    </div>
                  </form>

                  <form action={deleteWeeklyPriorityAction} className="table-actions">
                    <input name="priorityId" type="hidden" value={priority.id} />
                    <button className="button button-secondary" disabled={isSubmitted} type="submit">
                      Delete Priority
                    </button>
                  </form>

                  {priority.linkedKeyResult ? (
                    <form action={savePriorityCheckInAction} className="check-in-panel form-grid">
                      <input name="priorityId" type="hidden" value={priority.id} />
                      <div className="wide">
                        <h3>KR Check-in</h3>
                        <p className="muted">
                          Current KR value is {priority.linkedKeyResult.currentValue} of {priority.linkedKeyResult.targetValue}. Saving this check-in updates KR progress and pacing.
                        </p>
                      </div>
                      <label className="field">
                        <span>New Value</span>
                        <input
                          defaultValue={latestCheckIn?.newValue ?? priority.linkedKeyResult.currentValue}
                          disabled={isSubmitted}
                          name="newValue"
                          type="number"
                        />
                      </label>
                      <label className="field">
                        <span>KR Status</span>
                        <select defaultValue={latestCheckIn?.status ?? priority.linkedKeyResult.status} disabled={isSubmitted} name="status">
                          {workStatuses.map((status) => (
                            <option key={status} value={status}>
                              {formatEnumLabel(status)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Confidence</span>
                        <input
                          defaultValue={latestCheckIn?.confidenceScore ?? priority.linkedKeyResult.confidenceScore}
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
                        <Button disabled={isSubmitted} type="submit">
                          Save Check-in
                        </Button>
                        {latestCheckIn ? <Badge tone="success">Check-in saved</Badge> : <Badge tone="neutral">No check-in yet</Badge>}
                      </div>
                    </form>
                  ) : null}
                </div>
              </div>
            );
            })}
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
