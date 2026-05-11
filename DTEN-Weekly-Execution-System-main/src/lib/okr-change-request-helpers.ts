import type { Objective, OkrChangeRequest, User } from "@/types";

type RequestedChanges = OkrChangeRequest["requestedChanges"];
type OkrChangeInput = OkrChangeRequest | RequestedChanges;

const materialChangeKeys: Array<keyof RequestedChanges> = [
  "objectiveTitle",
  "keyResultTitle",
  "keyResultTargetValue",
  "monthlyTargets",
  "addKeyResult",
  "removeKeyResultId",
  "ownerUserId",
  "visibility",
  "parentObjectiveId",
  "linkedChildObjectiveId",
];

export function isMaterialOkrChange(change: OkrChangeInput): boolean {
  const requestedChanges = "requestedChanges" in change ? change.requestedChanges : change;
  if ((requestedChanges.materialChangeTypes ?? []).length > 0) {
    return true;
  }

  return materialChangeKeys.some((key) => requestedChanges[key] !== undefined);
}

export function canUserEditApprovedOkrDirectly(user: User, objective: Objective): boolean {
  if (objective.archived || objective.approvalState === "Approved") {
    return false;
  }

  return user.role === "Admin" || objective.ownerUserId === user.id;
}

export function canUserRequestOkrChange(user: User, objective: Objective): boolean {
  if (objective.archived || objective.approvalState !== "Approved") {
    return false;
  }

  return user.role === "Admin" || user.role === "Manager" || objective.ownerUserId === user.id;
}

export function canManagerApproveOkrChange(manager: User, changeRequest: OkrChangeRequest): boolean {
  if (changeRequest.status !== "pending" || changeRequest.requestedByUserId === manager.id) {
    return false;
  }

  return manager.role === "Admin" || (manager.role === "Manager" && changeRequest.approverUserId === manager.id);
}
