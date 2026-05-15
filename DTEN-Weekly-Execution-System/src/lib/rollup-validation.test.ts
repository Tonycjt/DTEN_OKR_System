import { describe, expect, it } from "vitest";
import {
  getRollupValidationTarget,
  objectiveRequiresCompleteRollup,
  sumRollupPercents,
  validateObjectiveKrWeights,
} from "./rollup-validation";

describe("roll-up validation", () => {
  it("sums missing and decimal percentages predictably", () => {
    expect(sumRollupPercents([{ percent: 33.335 }, { percent: 33.335 }, { percent: undefined }])).toBe(66.67);
  });

  it("allows incomplete KR weights while an objective is draft", () => {
    const result = validateObjectiveKrWeights({
      weights: [{ percent: 40 }, { percent: 20 }],
      status: "DRAFT",
      approvalStatus: "DRAFT",
    });

    expect(result.isValid).toBe(true);
    expect(result.total).toBe(60);
    expect(result.message).toContain("before activation or approval");
  });

  it("requires KR weights to total 100 for active objectives", () => {
    const result = validateObjectiveKrWeights({
      weights: [{ percent: 40 }, { percent: 20 }],
      status: "ON_TRACK",
      approvalStatus: "DRAFT",
    });

    expect(result.isValid).toBe(false);
    expect(result.message).toBe("KR weights must total 100%. Current total is 60%.");
  });

  it("recognizes approved and published objectives as complete-rollup states", () => {
    expect(objectiveRequiresCompleteRollup({ status: "DRAFT", approvalStatus: "APPROVED" })).toBe(true);
    expect(objectiveRequiresCompleteRollup({ status: "DRAFT", approvalStatus: "PUBLISHED" })).toBe(true);
  });

  it("maps progress sources to one validation target", () => {
    expect(getRollupValidationTarget("MANUAL")).toBe("NONE");
    expect(getRollupValidationTarget("DIRECT_KRS")).toBe("KR_WEIGHTS");
  });
});
