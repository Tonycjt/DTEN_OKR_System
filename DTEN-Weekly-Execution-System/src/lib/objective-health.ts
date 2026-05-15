// WorkStatus enum mapping from PRD language:
//   PRD "BLOCKED" → ON_HOLD  (a blocked KR/objective in our system)
//   PRD "BEHIND"  → OFF_TRACK (a behind KR/objective in our system)
// Computed health propagates upward: an ON_HOLD child makes the parent AT_RISK,
// and a majority of OFF_TRACK children makes the parent OFF_TRACK.
// The objective's stored status is set manually; computed health is advisory.

import type { WorkStatus } from "@prisma/client";

export type ObjectiveHealthResult = {
  computedStatus: WorkStatus | null;
  reason: string | null;
};

export function calculateObjectiveHealth(childStatuses: WorkStatus[]): ObjectiveHealthResult {
  if (childStatuses.length === 0) {
    return { computedStatus: null, reason: null };
  }

  // Any child ON_HOLD (PRD: BLOCKED) → parent is AT_RISK
  if (childStatuses.some((s) => s === "ON_HOLD")) {
    return { computedStatus: "AT_RISK", reason: "One or more children are blocked (On Hold)." };
  }

  // All children COMPLETED → parent is COMPLETED
  if (childStatuses.every((s) => s === "COMPLETED")) {
    return { computedStatus: "COMPLETED", reason: "All children are completed." };
  }

  // Majority children OFF_TRACK (PRD: BEHIND) → parent is OFF_TRACK
  const offTrackCount = childStatuses.filter((s) => s === "OFF_TRACK").length;
  if (offTrackCount > childStatuses.length / 2) {
    return {
      computedStatus: "OFF_TRACK",
      reason: `${offTrackCount} of ${childStatuses.length} children are off track.`,
    };
  }

  // Any child AT_RISK propagates up
  if (childStatuses.some((s) => s === "AT_RISK")) {
    return { computedStatus: "AT_RISK", reason: "One or more children are at risk." };
  }

  return { computedStatus: null, reason: null };
}

export function getObjectiveChildStatuses(objective: {
  progressSource: "MANUAL" | "DIRECT_KRS";
  keyResults: Array<{ status: WorkStatus }>;
}): WorkStatus[] {
  return objective.keyResults.map((kr) => kr.status);
}
