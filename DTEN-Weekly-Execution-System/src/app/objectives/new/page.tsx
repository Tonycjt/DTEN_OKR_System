import { PageHeader } from "@/components/ui/page-header";
import { getAssignableUsers } from "@/lib/org-scope";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";
import { CreateObjectiveForm } from "@/app/objectives/create-objective-form";

export default async function NewObjectivePage() {
  const user = await requireUser();

  const [allUsers, assignableUsers, departments, teams] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, role: true } }),
    getAssignableUsers(user.id, user.role),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.team.findMany({
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, department: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="stack">
      <PageHeader
        title="Create Objective"
        description="Save as a draft to continue later, or publish when your objective and KRs are ready."
      />
      <CreateObjectiveForm
        currentUserId={user.id}
        allUsers={allUsers.map((u) => ({ id: u.id, name: u.name, role: u.role }))}
        assignableUsers={assignableUsers.map((u) => ({ id: u.id, name: u.name, role: u.role }))}
        departments={departments}
        teams={teams}
      />
    </div>
  );
}
