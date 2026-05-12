import type { KeyResult, Prisma } from "@prisma/client";

export const krRiskWhere: Prisma.KeyResultWhereInput = {
  OR: [{ status: { in: ["AT_RISK", "OFF_TRACK", "ON_HOLD"] } }, { pacingStatus: { in: ["BEHIND", "NO_UPDATE"] } }, { confidenceScore: { lte: 2 } }],
};

export type KrRiskSignal = Pick<KeyResult, "status" | "pacingStatus" | "confidenceScore" | "progressPercent">;

export function getKrRiskReasons(kr: KrRiskSignal) {
  const reasons: string[] = [];

  if (kr.status === "ON_HOLD") {
    reasons.push("Blocked or on hold");
  } else if (kr.status === "OFF_TRACK") {
    reasons.push("Off track");
  } else if (kr.status === "AT_RISK") {
    reasons.push("At risk");
  }

  if (kr.pacingStatus === "BEHIND") {
    reasons.push("Behind monthly target");
  }

  if (kr.pacingStatus === "NO_UPDATE") {
    reasons.push("No current update");
  }

  if (kr.confidenceScore <= 2) {
    reasons.push("Low confidence");
  }

  if (kr.progressPercent < 25 && kr.status !== "COMPLETED") {
    reasons.push("Low progress");
  }

  return reasons;
}

export function formatReviewCompletionRate(reviewedCount: number, totalReviewableCount: number) {
  if (totalReviewableCount === 0) {
    return "n/a";
  }

  return `${Math.round((reviewedCount / totalReviewableCount) * 100)}%`;
}
