import { PageHeader } from "@/components/ui/page-header";
import { getDirectScopeUsers } from "@/lib/org-scope";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/prisma";
import { CreateObjectiveForm } from "@/app/objectives/create-objective-form";
import type { UserRole } from "@prisma/client";

function inferLevel(role: UserRole) {
  if (role === "CEO") return "COMPANY" as const;
  if (role === "DEPARTMENT_HEAD") return "DEPARTMENT" as const;
  if (role === "MANAGER") return "TEAM" as const;
  return "INDIVIDUAL" as const;
}

export default async function NewObjectivePage() {
  const user = await requireUser();

  const [assignableUsers, creator] = await Promise.all([
    getDirectScopeUsers(user.id),
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        role: true,
        department: { select: { name: true } },
        team: { select: { name: true } },
      },
    }),
  ]);

  const inferredLevel = inferLevel(creator.role);

  const inferredOrgLabel =
    inferredLevel === "DEPARTMENT" ? (creator.department?.name ?? null)
    : inferredLevel === "TEAM" ? (creator.team?.name ?? null)
    : null;

  const missingOrgContext =
    (inferredLevel === "DEPARTMENT" && !creator.department) ||
    (inferredLevel === "TEAM" && !creator.team);

  return (
    <div className="stack">
      <PageHeader
        title="Create Objective"
        description="Save as a draft to continue later, or publish when your objective and KRs are ready."
      />
      <CreateObjectiveForm
        currentUserId={user.id}
        assignableUsers={assignableUsers.map((u) => ({ id: u.id, name: u.name, role: u.role }))}
        inferredLevel={inferredLevel}
        inferredOrgLabel={inferredOrgLabel}
        missingOrgContext={missingOrgContext}
      />
    </div>
  );
}
