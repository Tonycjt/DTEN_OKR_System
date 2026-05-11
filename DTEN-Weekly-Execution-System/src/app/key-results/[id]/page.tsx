import Link from "next/link";
import type { WorkStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import { updateKeyResultAction } from "@/app/objectives/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { pacingStatusTone, workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

type KeyResultDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

const workStatuses: WorkStatus[] = ["DRAFT", "ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETED", "ON_HOLD"];

export default async function KeyResultDetailPage({ params }: KeyResultDetailPageProps) {
  await requireUser();
  const { id } = await params;

  const [keyResult, users] = await Promise.all([
    prisma.keyResult.findUnique({
      where: { id },
      include: {
        owner: true,
        objective: true,
        monthlyTargets: {
          orderBy: { monthIndex: "asc" },
        },
        checkIns: {
          orderBy: { createdAt: "desc" },
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
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!keyResult) {
    notFound();
  }

  const targetsByMonth = new Map(keyResult.monthlyTargets.map((target) => [target.monthIndex, target]));

  return (
    <div className="stack">
      <PageHeader title={keyResult.title} description={keyResult.metricName ?? "Key Result detail and target management."} />

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
                <span>{keyResult.owner.name}</span>
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
            <p>Edit KR values, owner, status, confidence, and monthly targets.</p>
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
                <select defaultValue={keyResult.ownerId} name="ownerId" required>
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
              {[1, 2, 3].map((monthIndex) => {
                const target = targetsByMonth.get(monthIndex);

                return (
                  <div className="form-grid wide" key={monthIndex}>
                    <label className="field">
                      <span>Month {monthIndex} Target Value</span>
                      <input defaultValue={target?.targetValue ?? ""} name={`targetValue${monthIndex}`} type="number" />
                    </label>
                    <label className="field">
                      <span>Month {monthIndex} Target Percent</span>
                      <input defaultValue={target?.targetPercent ?? ""} max="100" min="0" name={`targetPercent${monthIndex}`} type="number" />
                    </label>
                  </div>
                );
              })}
              <div className="wide">
                <Button type="submit">Update KR</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

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
            <h2>Comments</h2>
            <p>{keyResult.comments.length} comments are linked to this KR.</p>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
