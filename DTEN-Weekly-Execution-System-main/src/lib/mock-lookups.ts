import { departments, keyResults, objectives, quarters, teams, users } from "@/mock-data";
import { mergeById } from "@/lib/merge-by-id";
import type { Approval, KeyResult, Objective } from "@/types";

export function findUser(userId: string) {
  return users.find((user) => user.id === userId);
}

export function findDepartment(departmentId: string | null) {
  return departmentId ? departments.find((department) => department.id === departmentId) : undefined;
}

export function findTeam(teamId: string | null) {
  return teamId ? teams.find((team) => team.id === teamId) : undefined;
}

export function findQuarter(quarterId: string) {
  return quarters.find((quarter) => quarter.id === quarterId);
}

export function findObjective(objectiveId: string) {
  return objectives.find((objective) => objective.id === objectiveId);
}

export function getObjectiveKeyResults(objectiveId: string) {
  return keyResults.filter((keyResult) => keyResult.objectiveId === objectiveId);
}

export { mergeById };

export function getMergedObjectives(localObjectives: Objective[]) {
  return mergeById(objectives, localObjectives);
}

export function getMergedKeyResults(localKeyResults: KeyResult[]) {
  return mergeById(keyResults, localKeyResults);
}

export function getMergedApprovals(seededApprovals: Approval[], localApprovals: Approval[]) {
  return mergeById(seededApprovals, localApprovals);
}
