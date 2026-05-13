import Link from "next/link";
import { proposeChildObjectiveAction } from "@/app/objectives/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { pacingStatusTone, workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

export default async function MyOkrsPage() {
  const user = await requireUser();

  const [ownedObjectives, ownedKeyResults, assignedObjectives, allObjectives] = await Promise.all([
    prisma.objective.findMany({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      include: { keyResults: true, department: true, team: true },
    }),
    prisma.keyResult.findMany({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      include: { objective: true, monthlyTargets: { orderBy: { monthIndex: "asc" } } },
    }),
    prisma.objectiveAssignment.findMany({
      where: { assigneeType: "USER", assigneeId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        parentObjective: { include: { department: true, team: true, keyResults: true } },
        assignedObjective: { include: { department: true, team: true, keyResults: true } },
      },
    }),
    // all objectives available to propose as child (excluding those already linked)
    prisma.objective.findMany({
      orderBy: [{ level: "asc" }, { title: "asc" }],
      select: { id: true, title: true },
    }),
  ]);

  const assignmentStatusTone = (status: string) => {
    if (status === "ACTIVE" || status === "APPROVED") return "success" as const;
    if (status === "REJECTED") return "danger" as const;
    if (status === "NEEDS_REVISION") return "warning" as const;
    return "neutral" as const;
  };

  return (
    <div className="stack">
      <PageHeader
        title="My OKRs"
        description={`Objective and KR workspace for ${user.name}, showing status, confidence, and pacing separately.`}
      />

      <Card>
        <CardHeader>
          <h2>Owned Objectives</h2>
          <p>{ownedObjectives.length} objectives are directly owned by you.</p>
        </CardHeader>
        <CardContent>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Objective</th>
                  <th>Org</th>
                  <th>Status</th>
                  <th>Confidence</th>
                  <th>Progress</th>
                  <th>KRs</th>
                </tr>
              </thead>
              <tbody>
                {ownedObjectives.map((objective) => (
                  <tr key={objective.id}>
                    <td>
                      <Link href={`/objectives/${objective.id}`}>
                        <strong>{objective.title}</strong>
                      </Link>
                    </td>
                    <td>
                      {objective.department?.name ?? "Company"}
                      {objective.team ? ` / ${objective.team.name}` : ""}
                    </td>
                    <td>
                      <Badge tone={workStatusTone(objective.status)}>{formatEnumLabel(objective.status)}</Badge>
                    </td>
                    <td>{objective.confidenceScore}/5</td>
                    <td>
                      <div className="stack">
                        <span>{Math.round(objective.progressPercent)}%</span>
                        <ProgressBar value={objective.progressPercent} />
                      </div>
                    </td>
                    <td>{objective.keyResults.length}</td>
                  </tr>
                ))}
                {ownedObjectives.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No owned objectives yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2>Contributing Objectives</h2>
          <p>
            {assignedObjectives.length} contribution assignment{assignedObjectives.length !== 1 ? "s" : ""} where you
            are responsible for a portion of a parent objective.
          </p>
        </CardHeader>
        <CardContent>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Your Objective</th>
                  <th>Contributing To</th>
                  <th>Assignment Status</th>
                  <th>Contribution</th>
                  <th>Progress</th>
                  <th>KRs</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignedObjectives.map((assignment) => {
                  const displayObjective = assignment.assignedObjective ?? assignment.parentObjective;
                  const isLinked = assignment.assignedObjective !== null;
                  const canPropose =
                    assignment.assignmentMode === "CONTRIBUTION_ONLY" &&
                    (assignment.status === "PENDING_PROPOSAL" || assignment.status === "NEEDS_REVISION");

                  return (
                    <tr key={assignment.id}>
                      <td>
                        <Link href={`/objectives/${displayObjective.id}`}>
                          <strong>{displayObjective.title}</strong>
                        </Link>
                        {!isLinked ? (
                          <div className="muted" style={{ fontSize: "0.8em" }}>No child objective linked yet</div>
                        ) : null}
                        {assignment.assignmentInstruction ? (
                          <div className="muted" style={{ fontSize: "0.8em", marginTop: "2px" }}>
                            Instruction: {assignment.assignmentInstruction}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {isLinked ? (
                          <Link href={`/objectives/${assignment.parentObjective.id}`}>
                            {assignment.parentObjective.title}
                          </Link>
                        ) : (
                          <span className="muted">{assignment.parentObjective.title} (parent)</span>
                        )}
                      </td>
                      <td>
                        <Badge tone={assignmentStatusTone(assignment.status)}>
                          {formatEnumLabel(assignment.status)}
                        </Badge>
                      </td>
                      <td>{assignment.contributionPercent}%</td>
                      <td>
                        <div className="stack">
                          <span>{Math.round(displayObjective.progressPercent)}%</span>
                          <ProgressBar value={displayObjective.progressPercent} />
                        </div>
                      </td>
                      <td>{displayObjective.keyResults.length}</td>
                      <td>
                        {canPropose ? (
                          <form action={proposeChildObjectiveAction} className="form-grid">
                            <input name="assignmentId" type="hidden" value={assignment.id} />
                            <label className="field wide">
                              <span>Propose child objective</span>
                              <select name="proposedObjectiveId" required>
                                <option value="">Select an objective</option>
                                {allObjectives
                                  .filter((o) => o.id !== assignment.parentObjectiveId)
                                  .map((o) => (
                                    <option key={o.id} value={o.id}>
                                      {o.title}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <div className="field button-field">
                              <Button type="submit">Submit Proposal</Button>
                            </div>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                {assignedObjectives.length === 0 ? (
                  <tr>
                    <td colSpan={7}>No contributing objectives assigned to you yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2>Assigned Key Results</h2>
          <p>{ownedKeyResults.length} KRs are assigned to you.</p>
        </CardHeader>
        <CardContent>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Key Result</th>
                  <th>Objective</th>
                  <th>Status</th>
                  <th>Pacing</th>
                  <th>Confidence</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {ownedKeyResults.map((keyResult) => (
                  <tr key={keyResult.id}>
                    <td>
                      <Link href={`/key-results/${keyResult.id}`}>
                        <strong>{keyResult.title}</strong>
                      </Link>
                    </td>
                    <td>
                      <Link href={`/objectives/${keyResult.objectiveId}`}>{keyResult.objective.title}</Link>
                    </td>
                    <td>
                      <Badge tone={workStatusTone(keyResult.status)}>{formatEnumLabel(keyResult.status)}</Badge>
                    </td>
                    <td>
                      <Badge tone={pacingStatusTone(keyResult.pacingStatus)}>{formatEnumLabel(keyResult.pacingStatus)}</Badge>
                    </td>
                    <td>{keyResult.confidenceScore}/5</td>
                    <td>
                      <div className="stack">
                        <span>
                          {keyResult.currentValue} / {keyResult.targetValue}
                        </span>
                        <ProgressBar value={keyResult.progressPercent} />
                      </div>
                    </td>
                  </tr>
                ))}
                {ownedKeyResults.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No assigned KRs yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
