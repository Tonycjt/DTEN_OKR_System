import type { KeyResult, Objective, User, WeeklyReport } from "@/types";

export type CrossTeamVisibilityRule = {
  viewerTeamId: string;
  targetTeamId: string;
};

export type PermissionContext = {
  users: User[];
  objectives: Objective[];
  keyResults?: KeyResult[];
  crossTeamVisibilityRules?: CrossTeamVisibilityRule[];
  weeklyReportPolicy?: {
    includeLocalManager?: boolean;
  };
};

type CommentResource =
  | Objective
  | KeyResult
  | WeeklyReport
  | {
      resourceType: "objective" | "key_result" | "weekly_report";
      resourceId: string;
    };

export function canViewObjective(user: User, objective: Objective, context: PermissionContext) {
  if (objective.archived && user.role !== "Admin" && objective.ownerUserId !== user.id) {
    return false;
  }

  const owner = findUser(context, objective.ownerUserId);

  if (!owner) {
    return user.role === "Admin";
  }

  if (objective.visibility === "Company-wide") {
    return true;
  }

  if (user.role === "Admin") {
    return true;
  }

  if (objective.ownerUserId === user.id) {
    return true;
  }

  if (isPrimaryManagerOf(user, owner) || isLocalManagerOf(user, owner)) {
    return true;
  }

  if (objective.visibility === "Leadership-only") {
    return user.role === "Leadership";
  }

  if (objective.visibility === "Team-only") {
    return user.teamId === owner.teamId || hasCrossTeamVisibility(user, owner.teamId, context);
  }

  if (objective.visibility === "Manager visibility") {
    return isDirectReportOf(user, owner);
  }

  return false;
}

export function canEditObjective(user: User, objective: Objective, context: PermissionContext) {
  void context;

  if (objective.archived) {
    return false;
  }

  return objective.ownerUserId === user.id;
}

export function canApproveObjective(user: User, objective: Objective, context: PermissionContext) {
  const owner = findUser(context, objective.ownerUserId);

  return (
    Boolean(owner) &&
    objective.level === "individual" &&
    objective.approvalState === "Pending Approval" &&
    objective.ownerUserId !== user.id &&
    owner?.primaryManagerId === user.id
  );
}

export function canViewWeeklyReport(user: User, weeklyReport: WeeklyReport, context: PermissionContext) {
  const owner = findUser(context, weeklyReport.userId);

  if (!owner) {
    return user.role === "Admin";
  }

  if (weeklyReport.userId === user.id || user.role === "Admin") {
    return true;
  }

  if (owner.primaryManagerId === user.id) {
    return true;
  }

  return Boolean(context.weeklyReportPolicy?.includeLocalManager && owner.localManagerId === user.id);
}

export function canCommentOnResource(user: User, resource: CommentResource, context: PermissionContext) {
  if ("visibility" in resource) {
    return canViewObjective(user, resource, context);
  }

  if ("weekStartDate" in resource) {
    return canViewWeeklyReport(user, resource, context);
  }

  if ("objectiveId" in resource) {
    const objective = context.objectives.find((item) => item.id === resource.objectiveId);
    return objective ? canViewObjective(user, objective, context) : false;
  }

  if (resource.resourceType === "objective") {
    const objective = context.objectives.find((item) => item.id === resource.resourceId);
    return objective ? canViewObjective(user, objective, context) : false;
  }

  if (resource.resourceType === "key_result") {
    const keyResult = context.keyResults?.find((item) => item.id === resource.resourceId);
    const objective = keyResult ? context.objectives.find((item) => item.id === keyResult.objectiveId) : undefined;
    return objective ? canViewObjective(user, objective, context) : false;
  }

  return false;
}

export function canCreateRollupLink(user: User, parentKR: KeyResult, childObjective: Objective, context: PermissionContext) {
  const parentObjective = context.objectives.find((objective) => objective.id === parentKR.objectiveId);

  if (!parentObjective) {
    return false;
  }

  const canMaintainParent = canEditObjective(user, parentObjective, context) || parentKR.ownerUserId === user.id;
  const canReferenceParent = canViewObjective(user, parentObjective, context);
  const canReferenceChild = canViewObjective(user, childObjective, context);
  const childCanDriveRollup = childObjective.approvalState === "Approved" && childObjective.isActive && !childObjective.archived;

  return canMaintainParent && canReferenceParent && canReferenceChild && childCanDriveRollup;
}

export function canManageKeyResultTrackerLinks(user: User, keyResult: KeyResult, context: PermissionContext) {
  const objective = context.objectives.find((item) => item.id === keyResult.objectiveId);

  if (!objective || objective.archived) {
    return false;
  }

  return user.role === "Admin" || keyResult.ownerUserId === user.id || canEditObjective(user, objective, context);
}

function findUser(context: PermissionContext, userId: string) {
  return context.users.find((user) => user.id === userId);
}

function isPrimaryManagerOf(user: User, owner: User) {
  return owner.primaryManagerId === user.id;
}

function isLocalManagerOf(user: User, owner: User) {
  return owner.localManagerId === user.id;
}

function isDirectReportOf(user: User, owner: User) {
  return user.primaryManagerId === owner.id;
}

function hasCrossTeamVisibility(user: User, targetTeamId: string, context: PermissionContext) {
  return Boolean(
    context.crossTeamVisibilityRules?.some((rule) => rule.viewerTeamId === user.teamId && rule.targetTeamId === targetTeamId),
  );
}
