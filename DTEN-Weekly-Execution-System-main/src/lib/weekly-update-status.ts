import type { CheckIn, Objective, OkrUpdateStatus } from "@/types";

export function isValidCheckIn(checkIn: CheckIn) {
  const hasObjectiveTarget = Boolean(checkIn.objectiveId);
  const hasKeyResultProgressUpdate = Boolean(
    checkIn.resourceType === "key_result" &&
      checkIn.keyResultId &&
      (typeof checkIn.progressPercent === "number" || typeof checkIn.currentValue === "number" || hasMeaningfulText(checkIn.progressUpdate)),
  );
  const hasKeyResultStatusConfirmation = Boolean(checkIn.resourceType === "key_result" && checkIn.keyResultStatus);
  const hasObjectiveStatusOrConfidenceConfirmation = Boolean(
    checkIn.resourceType === "objective" && (checkIn.objectiveStatus || checkIn.confidence),
  );
  const hasProgressRiskOrNoChangeNote = hasMeaningfulText(checkIn.notes) || hasMeaningfulText(checkIn.progressUpdate);

  return (
    hasObjectiveTarget &&
    (checkIn.resourceType === "objective" || Boolean(checkIn.keyResultId)) &&
    (hasKeyResultProgressUpdate ||
      hasKeyResultStatusConfirmation ||
      hasObjectiveStatusOrConfidenceConfirmation ||
      hasProgressRiskOrNoChangeNote)
  );
}

export function deriveOkrUpdateStatus(activeObjectives: Objective[], checkInsForWeek: CheckIn[]): OkrUpdateStatus {
  if (activeObjectives.length === 0) {
    return "No Active OKRs";
  }

  const activeObjectiveIds = new Set(activeObjectives.map((objective) => objective.id));
  const updatedObjectiveIds = new Set(
    checkInsForWeek
      .filter((checkIn) => activeObjectiveIds.has(checkIn.objectiveId) && isValidCheckIn(checkIn))
      .map((checkIn) => checkIn.objectiveId),
  );

  if (updatedObjectiveIds.size === 0) {
    return "Not Updated";
  }

  if (updatedObjectiveIds.size < activeObjectives.length) {
    return "Partially Updated";
  }

  return "Updated";
}

function hasMeaningfulText(value?: string | null) {
  return Boolean(value?.trim());
}
