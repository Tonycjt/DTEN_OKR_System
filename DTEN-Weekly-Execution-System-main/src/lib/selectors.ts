import {
  approvals,
  comments,
  departments,
  keyResults,
  notifications,
  objectives,
  okrChangeRequests,
  quarters,
  teams,
  users,
} from "@/mock-data";
import type { LocalOkrStore } from "@/lib/local-okr-store";
import { mergeById } from "@/lib/merge-by-id";
import { canApproveObjective, canViewObjective } from "@/lib/permission-helpers";
import type {
  Approval,
  Objective,
  ObjectiveLevel,
  OkrChangeRequest,
  ResourceType,
  User,
} from "@/types";

export type SelectorContext = Partial<LocalOkrStore>;
export { mergeById };

export function getAllObjectives(context?: SelectorContext) {
  return mergeById(objectives, context?.objectives);
}

export function getAllKeyResults(context?: SelectorContext) {
  return mergeById(keyResults, context?.keyResults);
}

export function getAllApprovals(context?: SelectorContext) {
  return mergeById(approvals, context?.approvals);
}

export function getAllNotifications(context?: SelectorContext) {
  return mergeById(notifications, context?.notifications);
}

export function getAllOkrChangeRequests(context?: SelectorContext): OkrChangeRequest[] {
  return mergeById(okrChangeRequests, context?.okrChangeRequests);
}

export function getUserById(userId: string) {
  return users.find((user) => user.id === userId);
}

export function getUsersByTeam(teamId: string) {
  return users.filter((user) => user.teamId === teamId);
}

export function getDirectReports(managerId: string) {
  return users.filter((user) => user.primaryManagerId === managerId);
}

export function getObjectivesForUser(userId: string, context?: SelectorContext) {
  return getAllObjectives(context).filter((objective) => objective.ownerUserId === userId);
}

export function getObjectivesVisibleToUser(user: User, context?: SelectorContext) {
  const allObjectives = getAllObjectives(context);

  return allObjectives.filter((objective) =>
    canViewObjective(user, objective, {
      users,
      objectives: allObjectives,
      keyResults: getAllKeyResults(context),
    }),
  );
}

export function getActiveObjectivesForUser(userId: string, context?: SelectorContext) {
  return getObjectivesForUser(userId, context).filter((objective) => objective.isActive && objective.approvalState === "Approved");
}

export function getObjectivesByLevel(level: ObjectiveLevel, context?: SelectorContext) {
  return getAllObjectives(context).filter((objective) => objective.level === level);
}

export function getObjectivesByTeam(teamId: string, context?: SelectorContext) {
  return getAllObjectives(context).filter((objective) => objective.teamId === teamId);
}

export function getObjectivesByDepartment(departmentId: string, context?: SelectorContext) {
  return getAllObjectives(context).filter((objective) => objective.departmentId === departmentId);
}

export function getObjectiveById(objectiveId: string, context?: SelectorContext) {
  return getAllObjectives(context).find((objective) => objective.id === objectiveId);
}

export function getKeyResultsForObjective(objectiveId: string, context?: SelectorContext) {
  return getAllKeyResults(context).filter((keyResult) => keyResult.objectiveId === objectiveId);
}

export function getApprovalsForObjective(objectiveId: string, context?: SelectorContext) {
  return getAllApprovals(context).filter((approval) => approval.objectiveId === objectiveId);
}

export function getPendingApprovalsForManager(manager: User, context?: SelectorContext) {
  if (manager.role !== "Manager") {
    return [];
  }

  const allObjectives = getAllObjectives(context);
  const permissionContext = {
    users,
    objectives: allObjectives,
    keyResults: getAllKeyResults(context),
  };

  return getAllApprovals(context)
    .filter((approval) => approval.approvalStatus === "Pending" && approval.approverUserId === manager.id)
    .map((approval) => ({
      approval,
      objective: allObjectives.find((objective) => objective.id === approval.objectiveId),
    }))
    .filter((item): item is { approval: Approval; objective: Objective } =>
      Boolean(item.objective && canApproveObjective(manager, item.objective, permissionContext)),
    );
}

export function getCommentsForResource(resourceType: ResourceType, resourceId: string) {
  return comments.filter((comment) => comment.resourceType === resourceType && comment.resourceId === resourceId);
}

export function getNotificationsForUser(userId: string, context?: SelectorContext) {
  return getAllNotifications(context).filter((notification) => notification.userId === userId);
}

export function getCurrentQuarter() {
  return quarters.find((quarter) => quarter.isActive) ?? quarters[0];
}

export function getQuarterById(quarterId: string) {
  return quarters.find((quarter) => quarter.id === quarterId);
}

export function getTeamById(teamId: string | null) {
  return teamId ? teams.find((team) => team.id === teamId) : undefined;
}

export function getDepartmentById(departmentId: string | null) {
  return departmentId ? departments.find((department) => department.id === departmentId) : undefined;
}
