import type { PriorityType } from "@prisma/client";
import { carryOverPriorityAction, createPlanPriorityAction, deletePlanPriorityAction, updatePlanPriorityAction } from "@/app/weekly-plan/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { priorityStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { getMondayWeekStart, getSundayWeekEnd, formatWeekRange } from "@/lib/week";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

const priorityTypes: PriorityType[] = ["KR_LINKED", "AD_HOC"];

const errorMessages: Record<string, string> = {
  "kr-required": "KR-linked priorities must select a linked KR.",
  "kr-not-assigned": "That KR is not assigned to you.",
  "invalid-type": "Invalid priority type.",
  "not-found": "Priority not found.",
  "already-carried-over": "That priority has already been carried over to this week.",
};

type WeeklyPlanPageProps = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function WeeklyPlanPage({ searchParams }: WeeklyPlanPageProps) {
  const user = await requireUser();
  const weekStart = getMondayWeekStart();
  const weekEnd = getSundayWeekEnd(weekStart);
  const params = searchParams ? await searchParams : {};
  const error = params.error ? errorMessages[params.error] : null;

  const assignedKeyResults = await prisma.keyResult.findMany({
    where: { ownerId: user.id },
    orderBy: [{ objective: { title: "asc" } }, { title: "asc" }],
    include: { objective: true },
  });

  // This week's planned priorities
  const currentPriorities = await prisma.weeklyPriority.findMany({
    where: { userId: user.id, weekStartDate: weekStart },
    orderBy: { createdAt: "asc" },
    include: { linkedKeyResult: { include: { objective: true } } },
  });

  // Last week's incomplete priorities not yet carried over to this week
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const carriedOverSourceIds = currentPriorities
    .map((p) => p.carriedOverFromId)
    .filter((id): id is string => Boolean(id));

  const incompleteLastWeek = await prisma.weeklyPriority.findMany({
    where: {
      userId: user.id,
      weekStartDate: lastWeekStart,
      status: { notIn: ["DONE"] },
      id: { notIn: carriedOverSourceIds },
    },
    orderBy: { createdAt: "asc" },
    include: { linkedKeyResult: { include: { objective: true } } },
  });

  return (
    <div className="stack">
      <PageHeader
        title="Weekly Plan"
        description={`Plan your priorities for ${formatWeekRange(weekStart, weekEnd)}. Add, edit, or carry over priorities before the week begins.`}
      />

      {error ? <div className="alert">{error}</div> : null}

      {incompleteLastWeek.length > 0 ? (
        <Card>
          <CardHeader>
            <h2>Carry Over from Last Week</h2>
            <p>{incompleteLastWeek.length} incomplete {incompleteLastWeek.length === 1 ? "priority" : "priorities"} from last week. Click carry over to add them to this week.</p>
          </CardHeader>
          <CardContent>
            <div className="stack">
              {incompleteLastWeek.map((priority) => (
                <div className="card" key={priority.id}>
                  <div className="card-content">
                    <div className="table-actions">
                      <Badge tone={priorityStatusTone(priority.status)}>{formatEnumLabel(priority.status)}</Badge>
                      <Badge tone={priority.type === "KR_LINKED" ? "info" : "neutral"}>{formatEnumLabel(priority.type)}</Badge>
                      {priority.linkedKeyResult ? (
                        <Badge tone="info">{priority.linkedKeyResult.title}</Badge>
                      ) : null}
                    </div>
                    <p className="muted" style={{ marginTop: "0.5rem" }}>{priority.content}</p>
                    {priority.blocker ? <p className="muted"><strong>Blocker:</strong> {priority.blocker}</p> : null}
                    <form action={carryOverPriorityAction} style={{ marginTop: "0.75rem" }}>
                      <input name="sourcePriorityId" type="hidden" value={priority.id} />
                      <Button type="submit">Carry Over to This Week</Button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <h2>Add Priority</h2>
          <p>Plan what you intend to focus on this week. KR-linked priorities connect to measurable key results.</p>
        </CardHeader>
        <CardContent>
          <form action={createPlanPriorityAction} className="form-grid">
            <label className="field wide">
              <span>Priority</span>
              <textarea name="content" placeholder="What do you plan to work on this week?" required />
            </label>
            <label className="field">
              <span>Type</span>
              <select defaultValue="KR_LINKED" name="type" required>
                {priorityTypes.map((type) => (
                  <option key={type} value={type}>{formatEnumLabel(type)}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Linked KR</span>
              <select name="linkedKeyResultId">
                <option value="">None</option>
                {assignedKeyResults.map((kr) => (
                  <option key={kr.id} value={kr.id}>{kr.objective.title} / {kr.title}</option>
                ))}
              </select>
              {assignedKeyResults.length === 0 ? <small>No KRs are assigned to you.</small> : null}
            </label>
            <div className="wide">
              <Button type="submit">Add to Plan</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2>This Week&apos;s Plan</h2>
          <p>{currentPriorities.length} {currentPriorities.length === 1 ? "priority" : "priorities"} planned for this week. These will load into your weekly report.</p>
        </CardHeader>
        <CardContent>
          <div className="stack">
            {currentPriorities.map((priority) => {
              const selectableKrs =
                priority.linkedKeyResult && !assignedKeyResults.some((kr) => kr.id === priority.linkedKeyResultId)
                  ? [...assignedKeyResults, priority.linkedKeyResult]
                  : assignedKeyResults;

              return (
                <div className="card" key={priority.id}>
                  <div className="card-content">
                    {priority.carriedOverFromId ? (
                      <div style={{ marginBottom: "0.5rem" }}>
                        <Badge tone="neutral">Carried over</Badge>
                      </div>
                    ) : null}
                    <form action={updatePlanPriorityAction} className="form-grid">
                      <input name="priorityId" type="hidden" value={priority.id} />
                      <label className="field wide">
                        <span>Priority</span>
                        <textarea defaultValue={priority.content} name="content" required />
                      </label>
                      <label className="field">
                        <span>Type</span>
                        <select defaultValue={priority.type} name="type" required>
                          {priorityTypes.map((type) => (
                            <option key={type} value={type}>{formatEnumLabel(type)}</option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Linked KR</span>
                        <select defaultValue={priority.linkedKeyResultId ?? ""} name="linkedKeyResultId">
                          <option value="">None</option>
                          {selectableKrs.map((kr) => (
                            <option key={kr.id} value={kr.id}>{kr.objective.title} / {kr.title}</option>
                          ))}
                        </select>
                      </label>
                      <div className="wide table-actions">
                        <Badge tone={priorityStatusTone(priority.status)}>{formatEnumLabel(priority.status)}</Badge>
                        <Button type="submit">Save</Button>
                      </div>
                    </form>

                    <form action={deletePlanPriorityAction} className="table-actions" style={{ marginTop: "0.5rem" }}>
                      <input name="priorityId" type="hidden" value={priority.id} />
                      <button className="button button-secondary" type="submit">Remove</button>
                    </form>
                  </div>
                </div>
              );
            })}
            {currentPriorities.length === 0 ? (
              <div className="route-item">No priorities planned yet. Add some above to get started.</div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
