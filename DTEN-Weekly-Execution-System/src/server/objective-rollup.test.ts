import { describe, expect, it, vi } from "vitest";
import { recalculateObjectiveProgress } from "./objective-rollup";

function mockPrismaWithObjective(objective: unknown) {
  return {
    objective: {
      findUnique: vi.fn().mockResolvedValue(objective),
      update: vi.fn(),
    },
  };
}

describe("objective roll-up", () => {
  it("uses direct KRs when the objective progress source is DIRECT_KRS", async () => {
    const prisma = mockPrismaWithObjective({
      id: "objective-1",
      progressSource: "DIRECT_KRS",
      keyResults: [
        { progressPercent: 50, weightPercent: 40 },
        { progressPercent: 80, weightPercent: 60 },
      ],
    });

    await expect(recalculateObjectiveProgress(prisma as never, "objective-1")).resolves.toBe(68);
    expect(prisma.objective.update).toHaveBeenCalledWith({
      where: { id: "objective-1" },
      data: { progressPercent: 68 },
    });
  });

  it("does not overwrite manual objective progress", async () => {
    const prisma = mockPrismaWithObjective({
      id: "objective-1",
      progressSource: "MANUAL",
      keyResults: [{ progressPercent: 100, weightPercent: 100 }],
    });

    await expect(recalculateObjectiveProgress(prisma as never, "objective-1")).resolves.toBeNull();
    expect(prisma.objective.update).not.toHaveBeenCalled();
  });
});
