import Link from "next/link";
import type { WorkStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import { createFollowUpAction, updateFollowUpStatusAction } from "@/app/follow-ups/actions";
import { addKeyResultCommentAction, saveMonthlyTargetsAction } from "@/app/key-results/actions";
import { updateKeyResultAction } from "@/app/objectives/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { TrendChart } from "@/components/ui/trend-chart";
import { pacingStatusTone, workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { getMonthIndexForQuarter, getQuarterMonthNames } from "@/lib/okr-calculations";
import { getAssignableUsers } from "@/lib/org-scope";
import { formatShortDate } from "@/lib/week";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

type KeyResultDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    error?: string | string[];
  }>;
};

const workStatuses: WorkStatus[] = ["DRAFT", "ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETED", "ON_HOLD"];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function KeyResultDetailPage({ params, searchParams }: KeyResultDetailPageProps) {
  const currentUser = await requireUser();
  const { id } = await params;
  const error = firstParam((await searchParams)?.error);

  const [keyResult, users, followUps] = await Promise.all([
    prisma.keyResult.findUnique({
      where: { id },
      include: {
        owner: true,
        objective: true,
        monthlyTargets: {
          orderBy: { monthIndex: "asc" },
        },
        checkIns: {
          orderBy: [{ weeklyReport: { weekStart: "desc" } }, { createdAt: "desc" }],
          include: {
            user: true,
            weeklyReport: true,
          },
        },
        comments: {
          orderBy: { createdAt: "desc" },
          include: {
            author: true,
          },
        },
      },
    }),
    getAssignableUsers(currentUser.id, currentUser.role),
    prisma.followUp.findMany({
      where: {
        sourceObjectType: "KEY_RESULT",
        sourceObjectId: id,
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      include: {
        owner: true,
        assignedBy: true,
      },
    }),
  ]);

  if (!keyResult) {
    notFound();
  }

  const targetsByMonth = new Map(keyResult.monthlyTargets.map((target) => [target.monthIndex, target]));
  const quarterMonthNames = getQuarterMonthNames(keyResult.objective.quarter);
  const currentMonthIdx = getMonthIndexForQuarter(keyResult.objective.quarter);
  const trendCheckIns = [...keyResult.checkIns].reverse();
  const progressTrend = trendCheckIns.map((checkIn) => ({
    label: formatShortDate(checkIn.weeklyReport.weekStart),
    value: checkIn.progressPercent,
  }));
  const confidenceTrend = trendCheckIns.map((checkIn) => ({
    label: formatShortDate(checkIn.weeklyReport.weekStart),
    value: checkIn.confidenceScore,
  }));
  const canCreateFollowUp =
    currentUser.role === "ADMIN" ||
    currentUser.role === "CEO" ||
    currentUser.role === "EXECUTIVE" ||
    currentUser.role === "DEPARTMENT_HEAD" ||
    currentUser.role === "MANAGER";

  const canEditMonthlyTargets =
    keyResult.ownerId === currentUser.id ||
    currentUser.role === "ADMIN" ||
    currentUser.role === "CEO" ||
    currentUser.role === "EXECUTIVE" ||
    currentUser.role === "MANAGER";

  return (
    <div className="stack">
      <PageHeader title={keyResult.title} description={keyResult.metricName ?? "Key Result detail and target management."} />
      {error ? <div className="alert">{error}</div> : null}

      <div className="grid grid-2">
        <Card>
          <CardHeader>
            <h2>KR Summary</h2>
            <p>
              Linked to <Link href={`/objectives/${keyResult.objectiveId}`}>{keyResult.objective.title}</Link>.
            </p>
          </CardHeader>
          <CardContent>
            <div className="detail-list">
              <div className="detail-row">
                <span className="detail-label">Owner</span>
                <span>{keyResult.owner?.name ?? <span className="muted">No owner</span>}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Status</span>
                <Badge tone={workStatusTone(keyResult.status)}>{formatEnumLabel(keyResult.status)}</Badge>
              </div>
              <div className="detail-row">
                <span className="detail-label">Pacing</span>
                <Badge tone={pacingStatusTone(keyResult.pacingStatus)}>{formatEnumLabel(keyResult.pacingStatus)}</Badge>
              </div>
              <div className="detail-row">
                <span className="detail-label">Confidence</span>
                <span>{keyResult.confidenceScore}/5</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Weight</span>
                <span>{keyResult.weightPercent}% of objective progress</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Values</span>
                <span>
                  {keyResult.currentValue} current / {keyResult.targetValue} target
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Progress</span>
                <span className="stack">
                  {Math.round(keyResult.progressPercent)}%
                  <ProgressBar value={keyResult.progressPercent} />
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2>Update KR</h2>
            <p>Edit KR values, owner, status, and confidence.</p>
          </CardHeader>
          <CardContent>
            <form action={updateKeyResultAction} className="form-grid">
              <input name="keyResultId" type="hidden" value={keyResult.id} />
              <input name="objectiveId" type="hidden" value={keyResult.objectiveId} />
              <label className="field wide">
                <span>Title</span>
                <input defaultValue={keyResult.title} name="title" required />
              </label>
              <label className="field">
                <span>Metric</span>
                <input defaultValue={keyResult.metricName ?? ""} name="metricName" />
              </label>
              <label className="field">
                <span>Owner</span>
                <select defaultValue={keyResult.ownerId ?? ""} name="ownerId">
                  <option value="">No owner (assign later)</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Start</span>
                <input defaultValue={keyResult.startValue} name="startValue" type="number" />
              </label>
              <label className="field">
                <span>Current</span>
                <input defaultValue={keyResult.currentValue} name="currentValue" type="number" />
              </label>
              <label className="field">
                <span>Target</span>
                <input defaultValue={keyResult.targetValue} name="targetValue" type="number" />
              </label>
              <label className="field">
                <span>Status</span>
                <select defaultValue={keyResult.status} name="status" required>
                  {workStatuses.map((status) => (
                    <option key={status} value={status}>
                      {formatEnumLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Confidence</span>
                <input defaultValue={keyResult.confidenceScore} max="5" min="1" name="confidenceScore" type="number" />
              </label>
              <label className="field">
                <span>Weight Percent</span>
                <input defaultValue={keyResult.weightPercent} max="100" min="0" name="weightPercent" type="number" />
              </label>
              <div className="wide">
                <Button type="submit">Update KR</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2>Monthly Targets</h2>
          <p>Define what you plan to accomplish each month toward this KR. Set by the KR owner.</p>
        </CardHeader>
        <CardContent>
          <form action={saveMonthlyTargetsAction} className="form-grid">
            <input name="keyResultId" type="hidden" value={keyResult.id} />
            {[1, 2, 3].map((monthIndex) => {
              const target = targetsByMonth.get(monthIndex);
              const monthName = quarterMonthNames[monthIndex - 1];
              const isCurrent = currentMonthIdx === monthIndex;
              const isPast = currentMonthIdx !== null && monthIndex < currentMonthIdx;
              const label = isCurrent
                ? `${monthName} Goal — Current`
                : isPast
                ? `${monthName} Goal — Past`
                : `${monthName} Goal`;
              return (
                <label className="field wide" key={monthIndex}>
                  <span style={isCurrent ? { fontWeight: 700 } : isPast ? { color: "var(--color-muted)" } : undefined}>
                    {label}
                  </span>
                  <input
                    defaultValue={target?.title ?? ""}
                    disabled={!canEditMonthlyTargets}
                    name={`title${monthIndex}`}
                    placeholder={`What will you accomplish in ${monthName}?`}
                    style={isCurrent ? { borderColor: "var(--color-accent)" } : undefined}
                  />
                </label>
              );
            })}
            {canEditMonthlyTargets ? (
              <div className="wide">
                <Button type="submit">Save Monthly Targets</Button>
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2>KR Trends</h2>
          <p>Progress, confidence, and status movement from weekly check-in history.</p>
        </CardHeader>
        <CardContent>
          {trendCheckIns.length > 0 ? (
            <div className="grid grid-2">
              <div className="stack">
                <h3>Progress Trend</h3>
                <TrendChart label="KR progress over time" points={progressTrend} />
              </div>
              <div className="stack">
                <h3>Confidence Trend</h3>
                <TrendChart label="KR confidence over time" maxValue={5} points={confidenceTrend} />
              </div>
              <div className="wide">
                <div className="route-grid">
                  {trendCheckIns.map((checkIn) => (
                    <div className="route-item" key={checkIn.id}>
                      <span>
                        <strong>{formatShortDate(checkIn.weeklyReport.weekStart)}</strong>
                        <br />
                        <span className="muted">
                          {Math.round(checkIn.progressPercent)}% progress / confidence {checkIn.confidenceScore}/5
                        </span>
                      </span>
                      <Badge tone={workStatusTone(checkIn.status)}>{formatEnumLabel(checkIn.status)}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="route-item">No check-ins yet, so no trend data is available.</div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-2">
        <Card>
          <CardHeader>
            <h2>Check-in History</h2>
            <p>{keyResult.checkIns.length} check-ins are linked to this KR.</p>
          </CardHeader>
          <CardContent>
            <div className="route-grid">
              {keyResult.checkIns.map((checkIn) => (
                <div className="route-item" key={checkIn.id}>
                  <span>
                    <strong>{checkIn.user.name}</strong>
                    <br />
                    <span className="muted">{checkIn.note ?? "No note"}</span>
                  </span>
                  <span>
                    {checkIn.previousValue} to {checkIn.newValue}
                  </span>
                </div>
              ))}
              {keyResult.checkIns.length === 0 ? <div className="route-item">No check-ins yet.</div> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2>Follow-ups</h2>
            <p>Create and track action items tied to this KR.</p>
          </CardHeader>
          <CardContent>
            <div className="stack">
              {canCreateFollowUp ? (
                <form action={createFollowUpAction} className="form-shell">
                  <input name="sourceObjectType" type="hidden" value="KEY_RESULT" />
                  <input name="sourceObjectId" type="hidden" value={keyResult.id} />
                  <input name="redirectPath" type="hidden" value={`/key-results/${keyResult.id}`} />
                  <label className="field">
                    <span>Owner</span>
                    <select defaultValue={keyResult.ownerId ?? ""} name="ownerId" required>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Follow-up</span>
                    <textarea name="content" placeholder="Specific action needed to reduce risk or unblock progress." required />
                  </label>
                  <label className="field">
                    <span>Due Date</span>
                    <input name="dueDate" type="date" />
                  </label>
                  <Button type="submit">Create Follow-up</Button>
                </form>
              ) : null}

              <div className="route-grid">
                {followUps.map((followUp) => (
                  <div className="route-item" key={followUp.id}>
                    <span>
                      <strong>{followUp.content}</strong>
                      <br />
                      <span className="muted">
                        Owner: {followUp.owner.name} / Assigned by {followUp.assignedBy.name}
                        {followUp.dueDate ? ` / Due ${formatShortDate(followUp.dueDate)}` : ""}
                      </span>
                    </span>
                    {followUp.ownerId === currentUser.id || followUp.assignedById === currentUser.id || currentUser.role === "ADMIN" ? (
                      <form action={updateFollowUpStatusAction} className="table-actions">
                        <input name="followUpId" type="hidden" value={followUp.id} />
                        <input name="redirectPath" type="hidden" value={`/key-results/${keyResult.id}`} />
                        <select className="inline-select" defaultValue={followUp.status} name="status">
                          {["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"].map((status) => (
                            <option key={status} value={status}>
                              {formatEnumLabel(status)}
                            </option>
                          ))}
                        </select>
                        <Button tone="secondary" type="submit">
                          Save
                        </Button>
                      </form>
                    ) : (
                      <Badge>{formatEnumLabel(followUp.status)}</Badge>
                    )}
                  </div>
                ))}
                {followUps.length === 0 ? <div className="route-item">No follow-ups are linked to this KR yet.</div> : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-2">
        <Card>
          <CardHeader>
            <h2>Comments</h2>
            <p>{keyResult.comments.length} comments are linked to this KR. New comments notify the KR owner and their manager.</p>
          </CardHeader>
          <CardContent>
            <div className="stack">
              <form action={addKeyResultCommentAction} className="form-shell">
                <input name="keyResultId" type="hidden" value={keyResult.id} />
                <label className="field">
                  <span>Add Comment</span>
                  <textarea name="body" placeholder="Add risk context, follow-up notes, or executive guidance." required />
                </label>
                <Button type="submit">Add Comment</Button>
              </form>

              <div className="route-grid">
              {keyResult.comments.map((comment) => (
                <div className="route-item" key={comment.id}>
                  <span>
                    <strong>{comment.author.name}</strong>
                    <br />
                    <span className="muted">{comment.body}</span>
                  </span>
                </div>
              ))}
              {keyResult.comments.length === 0 ? <div className="route-item">No comments yet.</div> : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
