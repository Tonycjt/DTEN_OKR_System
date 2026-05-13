import { describe, expect, it } from "vitest";
import { calculateWeightedProgress } from "./okr-calculations";

describe("calculateWeightedProgress", () => {
  it("calculates weighted objective progress from child KRs", () => {
    expect(
      calculateWeightedProgress([
        { progressPercent: 50, weightPercent: 40 },
        { progressPercent: 80, weightPercent: 60 },
      ]),
    ).toBe(68);
  });

  it("normalizes incomplete draft weights instead of assuming 100 total", () => {
    expect(
      calculateWeightedProgress([
        { progressPercent: 25, weightPercent: 20 },
        { progressPercent: 75, weightPercent: 20 },
      ]),
    ).toBe(50);
  });

  it("returns zero when no weighted work contributes", () => {
    expect(calculateWeightedProgress([{ progressPercent: 90, weightPercent: 0 }])).toBe(0);
  });
});
