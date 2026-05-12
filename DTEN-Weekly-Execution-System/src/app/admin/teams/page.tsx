import { createTeamAction, updateTeamAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth";
import { prisma } from "@/server/prisma";

export default async function TeamsPage() {
  await requireRole(["ADMIN", "CEO", "DEPARTMENT_HEAD"]);

  const [departments, teams] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.team.findMany({
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
      include: {
        department: true,
        _count: {
          select: {
            users: true,
            objectives: true,
          },
        },
      },
    }),
  ]);

  return (
    <div className="stack">
      <PageHeader title="Teams" description="Create, edit, and view teams inside departments." />

      <Card>
        <CardHeader>
          <h2>Create Team</h2>
          <p>Teams connect users and objectives to the weekly execution rhythm.</p>
        </CardHeader>
        <CardContent>
          <form action={createTeamAction} className="form-grid">
            <label className="field">
              <span>Name</span>
              <input name="name" placeholder="Customer Onboarding Team" required />
            </label>
            <label className="field">
              <span>Department</span>
              <select name="departmentId" required>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field wide">
              <span>Description</span>
              <input name="description" placeholder="Team purpose" />
            </label>
            <div className="wide">
              <Button type="submit">Create Team</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2>Team Directory</h2>
          <p>{teams.length} teams are available for Release 1 workflows.</p>
        </CardHeader>
        <CardContent>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Edit Team</th>
                  <th>Users</th>
                  <th>Objectives</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => (
                  <tr key={team.id}>
                    <td>
                      <form action={updateTeamAction} className="form-grid">
                        <input name="teamId" type="hidden" value={team.id} />
                        <label className="field">
                          <span>Name</span>
                          <input defaultValue={team.name} name="name" required />
                        </label>
                        <label className="field">
                          <span>Department</span>
                          <select defaultValue={team.departmentId} name="departmentId" required>
                            {departments.map((department) => (
                              <option key={department.id} value={department.id}>
                                {department.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field wide">
                          <span>Description</span>
                          <input defaultValue={team.description ?? ""} name="description" />
                        </label>
                        <div className="wide">
                          <Button type="submit" tone="secondary">
                            Save Team
                          </Button>
                        </div>
                      </form>
                    </td>
                    <td>{team._count.users}</td>
                    <td>{team._count.objectives}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
