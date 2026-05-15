import type { UserRole } from "@prisma/client";
import { prisma } from "@/server/prisma";

export type AssignableUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title: string | null;
  managerId: string | null;
  departmentId: string | null;
};

// Returns the set of users the actor may assign a KR to.
// Rules (R3.4.5):
//   CEO / ADMIN / EXECUTIVE — the entire active company
//   DEPARTMENT_HEAD         — all active users in the same department
//   MANAGER                 — the actor + their direct and indirect reports
//   EMPLOYEE / VIEWER       — only themselves
const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  title: true,
  managerId: true,
  departmentId: true,
} as const;

// Returns the current user and their direct reports only.
// Used for objective/KR owner pickers — managers can only assign to people directly under them.
export async function getDirectScopeUsers(actorId: string): Promise<AssignableUser[]> {
  return prisma.user.findMany({
    where: { isActive: true, OR: [{ id: actorId }, { managerId: actorId }] },
    select: userSelect,
    orderBy: { name: "asc" },
  });
}

// Returns true if targetUserId is the actor themselves or one of their direct reports.
export async function isInDirectScope(actorId: string, targetUserId: string): Promise<boolean> {
  if (targetUserId === actorId) return true;
  const direct = await prisma.user.findFirst({
    where: { id: targetUserId, managerId: actorId, isActive: true },
    select: { id: true },
  });
  return direct !== null;
}

export async function getAssignableUsers(actorId: string, role: UserRole): Promise<AssignableUser[]> {
  const select = userSelect;

  if (role === "ADMIN") {
    return prisma.user.findMany({ where: { isActive: true }, select, orderBy: { name: "asc" } });
  }

  if (role === "CEO" || role === "EXECUTIVE") {
    const allActive = await prisma.user.findMany({ where: { isActive: true }, select, orderBy: { name: "asc" } });
    const subtree = buildSubtree(actorId, allActive);
    return allActive.filter((u) => subtree.has(u.id));
  }

  if (role === "DEPARTMENT_HEAD") {
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { departmentId: true } });
    return prisma.user.findMany({
      where: { isActive: true, ...(actor?.departmentId ? { departmentId: actor.departmentId } : { id: actorId }) },
      select,
      orderBy: { name: "asc" },
    });
  }

  // MANAGER: actor + all transitive reports
  const allActive = await prisma.user.findMany({ where: { isActive: true }, select, orderBy: { name: "asc" } });
  const subtree = buildSubtree(actorId, allActive);
  return allActive.filter((u) => subtree.has(u.id));
}

// Returns the user IDs that are in `rootId`'s reporting subtree (including root).
export function buildSubtree(rootId: string, users: Array<{ id: string; managerId: string | null }>): Set<string> {
  const subtree = new Set<string>([rootId]);
  let changed = true;

  while (changed) {
    changed = false;

    for (const user of users) {
      if (!subtree.has(user.id) && user.managerId && subtree.has(user.managerId)) {
        subtree.add(user.id);
        changed = true;
      }
    }
  }

  return subtree;
}

// Returns true if `targetUserId` is within the actor's assignable scope.
// CEO/ADMIN/EXECUTIVE skip the check (always allowed).
export async function isInAssignableScope(actorId: string, role: UserRole, targetUserId: string): Promise<boolean> {
  if (role === "ADMIN") {
    return true;
  }

  const assignable = await getAssignableUsers(actorId, role);
  return assignable.some((u) => u.id === targetUserId);
}
