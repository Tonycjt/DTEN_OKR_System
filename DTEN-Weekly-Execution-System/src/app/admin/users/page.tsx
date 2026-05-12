import type { UserRole } from "@prisma/client";
import { createUserAction, updateUserAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatEnumLabel } from "@/lib/format";
import { requireRole } from "@/server/auth";
import { prisma } from "@/server/prisma";

const roleOptions: UserRole[] = ["ADMIN", "CEO", "DEPARTMENT_HEAD", "MANAGER", "EMPLOYEE"];

export default async function UsersPage() {
  await requireRole(["ADMIN", "CEO", "DEPARTMENT_HEAD"]);

  const [users, departments, teams, managerOptions] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      include: {
        department: true,
        team: true,
        manager: true,
        _count: {
          select: {
            reports: true,
            ownedObjectives: true,
            ownedKeyResults: true,
          },
        },
      },
    }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.team.findMany({
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
      include: { department: true },
    }),
    prisma.user.findMany({
      where: {
        role: {
          in: ["ADMIN", "CEO", "DEPARTMENT_HEAD", "MANAGER"],
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="stack">
      <PageHeader title="Users" description="Create and edit users, roles, departments, teams, and managers." />

      <Card>
        <CardHeader>
          <h2>Create User</h2>
          <p>New users receive the local demo password unless a custom one is provided.</p>
        </CardHeader>
        <CardContent>
          <form action={createUserAction} className="form-grid">
            <label className="field">
              <span>Name</span>
              <input name="name" placeholder="Taylor Nguyen" required />
            </label>
            <label className="field">
              <span>Email</span>
              <input name="email" placeholder="taylor@dten.com" required type="email" />
            </label>
            <label className="field">
              <span>Title</span>
              <input name="title" placeholder="Program Manager" />
            </label>
            <label className="field">
              <span>Role</span>
              <select name="role" required>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {formatEnumLabel(role)}
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
              <span>Manager</span>
              <select name="managerId">
                <option value="">None</option>
                {managerOptions.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name} ({formatEnumLabel(manager.role)})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Password</span>
              <input name="password" placeholder="Password123!" type="password" />
            </label>
            <div className="wide">
              <Button type="submit">Create User</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2>User Directory</h2>
          <p>{users.length} seeded and created users are available for Release 1 workflows.</p>
        </CardHeader>
        <CardContent>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Edit User</th>
                  <th>Owned Work</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <form action={updateUserAction} className="form-grid">
                        <input name="userId" type="hidden" value={user.id} />
                        <label className="field">
                          <span>Name</span>
                          <input defaultValue={user.name} name="name" required />
                        </label>
                        <label className="field">
                          <span>Email</span>
                          <input defaultValue={user.email} name="email" required type="email" />
                        </label>
                        <label className="field">
                          <span>Title</span>
                          <input defaultValue={user.title ?? ""} name="title" />
                        </label>
                        <label className="field">
                          <span>Role</span>
                          <select defaultValue={user.role} name="role" required>
                            {roleOptions.map((role) => (
                              <option key={role} value={role}>
                                {formatEnumLabel(role)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Department</span>
                          <select defaultValue={user.departmentId ?? ""} name="departmentId">
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
                          <select defaultValue={user.teamId ?? ""} name="teamId">
                            <option value="">None</option>
                            {teams.map((team) => (
                              <option key={team.id} value={team.id}>
                                {team.department.name} / {team.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Manager</span>
                          <select defaultValue={user.managerId ?? ""} name="managerId">
                            <option value="">None</option>
                            {managerOptions.map((manager) => (
                              <option key={manager.id} value={manager.id}>
                                {manager.name} ({formatEnumLabel(manager.role)})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Password</span>
                          <input name="password" placeholder="Leave unchanged" type="password" />
                        </label>
                        <div className="wide">
                          <Button type="submit" tone="secondary">
                            Save User
                          </Button>
                        </div>
                      </form>
                    </td>
                    <td>
                      {user._count.ownedObjectives} objectives, {user._count.ownedKeyResults} KRs, {user._count.reports} reports
                    </td>
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
