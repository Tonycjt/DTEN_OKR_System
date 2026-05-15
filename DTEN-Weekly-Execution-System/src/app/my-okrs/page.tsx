import Link from "next/link";
import type { WorkStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { pacingStatusTone, workStatusTone } from "@/lib/badge-tone";
import { formatEnumLabel } from "@/lib/format";
import { getMonthIndexForQuarter, getQuarterMonthNames } from "@/lib/okr-calculations";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

export default async function MyOkrsPage() {
  const user = await requireUser();

  const [ownedObjectives, ownedKeyResults] = await Promise.all([
    prisma.objective.findMany({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      include: { keyResults: true, department: true, team: true },
    }),
    prisma.keyResult.findMany({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        objective: {
          include: {
            department: true,
            team: true,
            keyResults: { select: { id: true } },
          },
        },
        monthlyTargets: { orderBy: { monthIndex: "asc" } },
      },
    }),
  ]);

  // Build a unified objectives list:
  // - Start with all directly owned objectives → tagged "owner"
  // - Add any objectives reachable via an assigned KR that aren't already in the list → tagged "assigned_kr"
  // An objective where user is both owner and has a KR gets the "owner" tag (higher privilege).
  type ObjRow = {
    id: string;
    title: string;
    status: WorkStatus;
    confidenceScore: number;
    progressPercent: number;
    department: { name: string } | null;
    team: { name: string } | null;
    keyResults: { id: string }[];
    tag: "owner" | "assigned_kr";
  };

  const ownedIds = new Set(ownedObjectives.map((o) => o.id));

  const unifiedObjectives: ObjRow[] = [
    ...ownedObjectives.map((o) => ({ ...o, tag: "owner" as const })),
  ];

  for (const kr of ownedKeyResults) {
    const obj = kr.objective;
    if (!ownedIds.has(obj.id)) {
      ownedIds.add(obj.id);
      unifiedObjectives.push({ ...obj, tag: "assigned_kr" as const });
    }
  }

  return (
    <div className="stack">
      <PageHeader
        title="My OKRs"
        description={`All objectives and key results connected to ${user.name}.`}
        actions={<LinkButton href="/objectives/new">Create Objective</LinkButton>}
      />

      {/* Unified objectives table */}
      <Card>
        <CardHeader>
          <h2>My Objectives</h2>
          <p>
            {unifiedObjectives.length} objective{unifiedObjectives.length !== 1 ? "s" : ""} — objectives you own or have an assigned KR under.
            {" "}<span className="muted">Owner = you created / own the objective and can edit it. Assigned KR = you own a KR under this objective; the objective context is read-only.</span>
          </p>
        </CardHeader>
        <CardContent>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Objective</th>
                  <th>Org</th>
                  <th>Your Role</th>
                  <th>Status</th>
                  <th>Confidence</th>
                  <th>Progress</th>
                  <th>KRs</th>
                </tr>
              </thead>
              <tbody>
                {unifiedObjectives.map((objective) => (
                  <tr key={objective.id}>
                    <td>
                      <Link href={`/objectives/${objective.id}`}>
                        <strong>{objective.title}</strong>
                      </Link>
                    </td>
                    <td className="muted">
                      {objective.department?.name ?? "Company"}
                      {objective.team ? ` / ${objective.team.name}` : ""}
                    </td>
                    <td>
                      {objective.tag === "owner" ? (
                        <Badge tone="info">Owner</Badge>
                      ) : (
                        <Badge tone="neutral">Assigned KR</Badge>
                      )}
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
                {unifiedObjectives.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">No objectives linked to you yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Assigned Key Results */}
      <Card>
        <CardHeader>
          <h2>Assigned Key Results</h2>
          <p>{ownedKeyResults.length} KR{ownedKeyResults.length !== 1 ? "s" : ""} assigned to you across all objectives.</p>
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
                  <th>Monthly Targets</th>
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
                      <Link href={`/objectives/${keyResult.objectiveId}`} className="muted">
                        {keyResult.objective.title}
                      </Link>
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
                    <td className="muted">
                      {(() => {
                        const names = getQuarterMonthNames(keyResult.objective.quarter);
                        const currentIdx = getMonthIndexForQuarter(keyResult.objective.quarter);
                        if (currentIdx) {
                          const current = keyResult.monthlyTargets.find((t) => t.monthIndex === currentIdx);
                          return `${names[currentIdx - 1]}: ${current?.title ?? "—"}`;
                        }
                        return keyResult.monthlyTargets.length > 0
                          ? keyResult.monthlyTargets.map((t) => `${names[t.monthIndex - 1]}: ${t.title ?? "–"}`).join(" / ")
                          : "No targets set";
                      })()}
                    </td>
                  </tr>
                ))}
                {ownedKeyResults.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">No assigned KRs yet.</td>
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
