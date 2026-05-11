import { keyResults as seededKeyResults, objectives as seededObjectives } from "@/mock-data";
import type { LocalOkrStore } from "@/lib/local-okr-store";
import { mergeById } from "@/lib/merge-by-id";
import type { KeyResult, KeyResultStatus, Objective, ObjectiveStatus } from "@/types";

export function isObjectiveEligibleForRollup(objective?: Objective) {
  return Boolean(objective && objective.approvalState === "Approved" && objective.isActive && !objective.archived && objective.status !== "Archived");
}

export function getEffectiveKeyResult(keyResult: KeyResult, objectives: Objective[]) {
  const childObjective = keyResult.linkedChildObjectiveId ? objectives.find((objective) => objective.id === keyResult.linkedChildObjectiveId) : undefined;

  if (!childObjective || !isObjectiveEligibleForRollup(childObjective)) {
    return keyResult;
  }

  return {
    ...keyResult,
    currentValue: childObjective.score,
    progressPercent: childObjective.score,
    status: objectiveStatusToKeyResultStatus(childObjective.status),
    rollupMode: "Auto from linked child objective" as const,
  };
}

export function getEffectiveKeyResults(keyResults: KeyResult[], objectives: Objective[]) {
  return keyResults.map((keyResult) => getEffectiveKeyResult(keyResult, objectives));
}

export function calculateObjectiveScoreFromKeyResults(objectiveId: string, keyResults: KeyResult[]) {
  const objectiveKeyResults = keyResults.filter((keyResult) => keyResult.objectiveId === objectiveId);

  if (objectiveKeyResults.length === 0) {
    return 0;
  }

  return Math.round(objectiveKeyResults.reduce((total, keyResult) => total + keyResult.progressPercent, 0) / objectiveKeyResults.length);
}

export function applyRollupAutomation(store: LocalOkrStore): LocalOkrStore {
  const allObjectives = mergeById(seededObjectives, store.objectives);
  const allKeyResults = mergeById(seededKeyResults, store.keyResults);
  const effectiveKeyResults = getEffectiveKeyResults(allKeyResults, allObjectives);
  const changedKeyResults = effectiveKeyResults.filter((effectiveKeyResult) => {
    const original = allKeyResults.find((keyResult) => keyResult.id === effectiveKeyResult.id);
    return (
      original &&
      original.linkedChildObjectiveId &&
      (original.currentValue !== effectiveKeyResult.currentValue ||
        original.progressPercent !== effectiveKeyResult.progressPercent ||
        original.status !== effectiveKeyResult.status ||
        original.rollupMode !== effectiveKeyResult.rollupMode)
    );
  });
  const affectedObjectiveIds = new Set(changedKeyResults.map((keyResult) => keyResult.objectiveId));
  const changedObjectives = allObjectives
    .filter((objective) => affectedObjectiveIds.has(objective.id))
    .map((objective) => ({
      ...objective,
      score: calculateObjectiveScoreFromKeyResults(objective.id, effectiveKeyResults),
    }))
    .filter((objective) => {
      const original = allObjectives.find((item) => item.id === objective.id);
      return original && original.score !== objective.score;
    });

  if (changedKeyResults.length === 0 && changedObjectives.length === 0) {
    return store;
  }

  const changedKeyResultIds = new Set(changedKeyResults.map((keyResult) => keyResult.id));
  const changedObjectiveIds = new Set(changedObjectives.map((objective) => objective.id));

  return {
    ...store,
    keyResults: [...changedKeyResults, ...store.keyResults.filter((keyResult) => !changedKeyResultIds.has(keyResult.id))],
    objectives: [...changedObjectives, ...store.objectives.filter((objective) => !changedObjectiveIds.has(objective.id))],
  };
}

export function objectiveStatusToKeyResultStatus(status: ObjectiveStatus): KeyResultStatus {
  if (status === "Completed") return "Completed";
  if (status === "At Risk") return "At Risk";
  if (status === "Off Track") return "Off Track";
  if (status === "Draft" || status === "Archived") return "Not Started";
  return "On Track";
}
