import type { ObjectiveLevel, ObjectiveProgressSource, WorkStatus } from "@prisma/client";
import { createObjectiveAction } from "@/app/objectives/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatEnumLabel } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

const objectiveLevels: ObjectiveLevel[] = ["COMPANY", "DEPARTMENT", "TEAM", "INDIVIDUAL"];
const objectiveProgressSources: ObjectiveProgressSource[] = ["MANUAL", "DIRECT_KRS", "CHILD_OBJECTIVES"];
const workStatuses: WorkStatus[] = ["DRAFT", "ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETED", "ON_HOLD"];

type NewObjectivePageProps = {
  searchParams?: Promise<{
    error?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewObjectivePage({ searchParams }: NewObjectivePageProps) {
  const user = await requireUser();
  const error = firstParam((await searchParams)?.error);

  const [users, departments, teams, parentObjectives] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.team.findMany({ orderBy: [{ department: { name: "asc" } }, { name: "asc" }], include: { department: true } }),
    prisma.objective.findMany({ orderBy: [{ level: "asc" }, { title: "asc" }] }),
  ]);

  return (
    <div className="stack">
      <PageHeader title="Create Objective" description="Create a company, department, team, or individual objective." />
      {error ? <div className="alert">{error}</div> : null}
      <Card>
        <CardHeader>
          <h2>Objective Details</h2>
          <p>Objectives can align to a parent objective and later hold multiple KRs.</p>
        </CardHeader>
        <CardContent>
          <form action={createObjectiveAction} className="form-grid">
            <label className="field wide">
              <span>Title</span>
              <input name="title" placeholder="Improve customer onboarding quality" required />
            </label>
            <label className="field wide">
              <span>Description</span>
              <textarea name="description" placeholder="Describe the intended outcome" />
            </label>
            <label className="field">
              <span>Level</span>
              <select name="level" required>
                {objectiveLevels.map((level) => (
                  <option key={level} value={level}>
                    {formatEnumLabel(level)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select defaultValue="DRAFT" name="status" required>
                {workStatuses.map((status) => (
                  <option key={status} value={status}>
                    {formatEnumLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Progress Source</span>
              <select defaultValue="MANUAL" name="progressSource" required>
                {objectiveProgressSources.map((source) => (
                  <option key={source} value={source}>
                    {formatEnumLabel(source)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Quarter</span>
              <input defaultValue="2026-Q2" name="quarter" required />
            </label>
            <label className="field">
              <span>Owner</span>
              <select defaultValue={user.id} name="ownerId" required>
                {users.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name} ({formatEnumLabel(owner.role)})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Department</span>
              <select name="departmentId">
                <option value="">None</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Team</span>
              <select name="teamId">
                <option value="">None</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.department.name} / {team.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Parent Objective</span>
              <select name="parentObjectiveId">
                <option value="">None</option>
                {parentObjectives.map((objective) => (
                  <option key={objective.id} value={objective.id}>
                    {objective.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Progress Percent</span>
              <input defaultValue="0" max="100" min="0" name="progressPercent" type="number" />
            </label>
            <label className="field">
              <span>Confidence</span>
              <input defaultValue="3" max="5" min="1" name="confidenceScore" type="number" />
            </label>
            <div className="wide">
              <Button type="submit">Save Objective</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
