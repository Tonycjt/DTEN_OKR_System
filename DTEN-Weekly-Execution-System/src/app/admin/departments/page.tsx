import { createDepartmentAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth";
import { prisma } from "@/server/prisma";

export default async function DepartmentsPage() {
  await requireRole(["ADMIN", "CEO", "DEPARTMENT_HEAD"]);

  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          users: true,
          teams: true,
          objectives: true,
        },
      },
    },
  });

  return (
    <div className="stack">
      <PageHeader title="Departments" description="Create and view Release 1 department records." />

      <Card>
        <CardHeader>
          <h2>Create Department</h2>
          <p>Departments organize users, teams, and objectives for visibility and permissions.</p>
        </CardHeader>
        <CardContent>
          <form action={createDepartmentAction} className="form-grid">
            <label className="field">
              <span>Name</span>
              <input name="name" placeholder="Customer Success" required />
            </label>
            <label className="field">
              <span>Description</span>
              <input name="description" placeholder="Department purpose" />
            </label>
            <div className="wide">
              <Button type="submit">Create Department</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2>Department Directory</h2>
          <p>{departments.length} departments are available for Release 1 workflows.</p>
        </CardHeader>
        <CardContent>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Users</th>
                  <th>Teams</th>
                  <th>Objectives</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((department) => (
                  <tr key={department.id}>
                    <td>{department.name}</td>
                    <td>{department.description ?? <span className="muted">No description</span>}</td>
                    <td>{department._count.users}</td>
                    <td>{department._count.teams}</td>
                    <td>{department._count.objectives}</td>
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
