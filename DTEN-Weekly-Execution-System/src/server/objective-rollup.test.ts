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
      parentAssignments: [
        { contributionPercent: 100, assignedObjective: { progressPercent: 10 } },
      ],
    });

    await expect(recalculateObjectiveProgress(prisma as never, "objective-1")).resolves.toBe(68);
    expect(prisma.objective.update).toHaveBeenCalledWith({
      where: { id: "objective-1" },
      data: { progressPercent: 68 },
    });
  });

  it("uses child objective assignments when the objective progress source is CHILD_OBJECTIVES", async () => {
    const prisma = mockPrismaWithObjective({
      id: "objective-1",
      progressSource: "CHILD_OBJECTIVES",
      keyResults: [{ progressPercent: 100, weightPercent: 100 }],
      parentAssignments: [
        { contributionPercent: 50, assignedObjective: { progressPercent: 20 } },
        { contributionPercent: 50, assignedObjective: { progressPercent: 80 } },
      ],
    });

    await expect(recalculateObjectiveProgress(prisma as never, "objective-1")).resolves.toBe(50);
    expect(prisma.objective.update).toHaveBeenCalledWith({
      where: { id: "objective-1" },
      data: { progressPercent: 50 },
    });
  });

  it("does not overwrite manual objective progress", async () => {
    const prisma = mockPrismaWithObjective({
      id: "objective-1",
      progressSource: "MANUAL",
      keyResults: [{ progressPercent: 100, weightPercent: 100 }],
      parentAssignments: [],
    });

    await expect(recalculateObjectiveProgress(prisma as never, "objective-1")).resolves.toBeNull();
    expect(prisma.objective.update).not.toHaveBeenCalled();
  });
});
