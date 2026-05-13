export type RollupApprovalStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "PUBLISHED";
export type RollupWorkStatus = "DRAFT" | "ON_TRACK" | "AT_RISK" | "OFF_TRACK" | "COMPLETED" | "ON_HOLD";
export type RollupProgressSource = "MANUAL" | "DIRECT_KRS" | "CHILD_OBJECTIVES";

export type RollupPercentItem = {
  percent: number | null | undefined;
};

export type RollupPercentValidation = {
  total: number;
  expectedTotal: number;
  isValid: boolean;
  message: string | null;
};

export type RollupValidationTarget = "NONE" | "KR_WEIGHTS" | "OBJECTIVE_ASSIGNMENTS";

const percentTolerance = 0.01;

export function roundPercentTotal(value: number) {
  return Math.round(value * 100) / 100;
}

export function sumRollupPercents(items: RollupPercentItem[]) {
  return roundPercentTotal(items.reduce((total, item) => total + (Number.isFinite(item.percent) ? Number(item.percent) : 0), 0));
}

export function objectiveRequiresCompleteRollup({
  status,
  approvalStatus,
}: {
  status: RollupWorkStatus;
  approvalStatus: RollupApprovalStatus;
}) {
  if (approvalStatus === "PENDING_APPROVAL" || approvalStatus === "APPROVED" || approvalStatus === "PUBLISHED") {
    return true;
  }

  return status !== "DRAFT";
}

export function getRollupValidationTarget(progressSource: RollupProgressSource): RollupValidationTarget {
  if (progressSource === "DIRECT_KRS") {
    return "KR_WEIGHTS";
  }

  if (progressSource === "CHILD_OBJECTIVES") {
    return "OBJECTIVE_ASSIGNMENTS";
  }

  return "NONE";
}

export function validateRollupPercentTotal({
  items,
  label,
  allowIncomplete,
  expectedTotal = 100,
}: {
  items: RollupPercentItem[];
  label: string;
  allowIncomplete: boolean;
  expectedTotal?: number;
}): RollupPercentValidation {
  const total = sumRollupPercents(items);
  const isBalanced = Math.abs(total - expectedTotal) <= percentTolerance;

  if (isBalanced) {
    return {
      total,
      expectedTotal,
      isValid: true,
      message: null,
    };
  }

  if (allowIncomplete) {
    return {
      total,
      expectedTotal,
      isValid: true,
      message: `${label} currently total ${total}%, and must total ${expectedTotal}% before activation or approval.`,
    };
  }

  return {
    total,
    expectedTotal,
    isValid: false,
    message: `${label} must total ${expectedTotal}%. Current total is ${total}%.`,
  };
}

export function validateObjectiveKrWeights({
  weights,
  status,
  approvalStatus,
}: {
  weights: RollupPercentItem[];
  status: RollupWorkStatus;
  approvalStatus: RollupApprovalStatus;
}) {
  return validateRollupPercentTotal({
    items: weights,
    label: "KR weights",
    allowIncomplete: !objectiveRequiresCompleteRollup({ status, approvalStatus }),
  });
}

export function validateObjectiveAssignmentContributions({
  contributions,
  status,
  approvalStatus,
}: {
  contributions: RollupPercentItem[];
  status: RollupWorkStatus;
  approvalStatus: RollupApprovalStatus;
}) {
  return validateRollupPercentTotal({
    items: contributions,
    label: "Objective assignment contributions",
    allowIncomplete: !objectiveRequiresCompleteRollup({ status, approvalStatus }),
  });
}
