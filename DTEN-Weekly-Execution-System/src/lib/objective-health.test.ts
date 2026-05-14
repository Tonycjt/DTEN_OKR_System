import { describe, expect, it } from "vitest";
import { calculateObjectiveHealth, getObjectiveChildStatuses } from "./objective-health";

describe("calculateObjectiveHealth", () => {
  it("returns null when no children", () => {
    const result = calculateObjectiveHealth([]);
    expect(result.computedStatus).toBeNull();
    expect(result.reason).toBeNull();
  });

  it("returns AT_RISK when any child is ON_HOLD", () => {
    const result = calculateObjectiveHealth(["ON_TRACK", "ON_HOLD", "ON_TRACK"]);
    expect(result.computedStatus).toBe("AT_RISK");
  });

  it("returns AT_RISK for single ON_HOLD child", () => {
    const result = calculateObjectiveHealth(["ON_HOLD"]);
    expect(result.computedStatus).toBe("AT_RISK");
  });

  it("returns COMPLETED when all children are COMPLETED", () => {
    const result = calculateObjectiveHealth(["COMPLETED", "COMPLETED", "COMPLETED"]);
    expect(result.computedStatus).toBe("COMPLETED");
  });

  it("does not return COMPLETED when not all children are completed", () => {
    const result = calculateObjectiveHealth(["COMPLETED", "COMPLETED", "ON_TRACK"]);
    expect(result.computedStatus).not.toBe("COMPLETED");
  });

  it("returns OFF_TRACK when majority are OFF_TRACK", () => {
    const result = calculateObjectiveHealth(["OFF_TRACK", "OFF_TRACK", "ON_TRACK"]);
    expect(result.computedStatus).toBe("OFF_TRACK");
  });

  it("does not return OFF_TRACK for exactly half OFF_TRACK", () => {
    const result = calculateObjectiveHealth(["OFF_TRACK", "ON_TRACK"]);
    expect(result.computedStatus).not.toBe("OFF_TRACK");
  });

  it("returns AT_RISK when any child is AT_RISK (no ON_HOLD)", () => {
    const result = calculateObjectiveHealth(["ON_TRACK", "AT_RISK", "ON_TRACK"]);
    expect(result.computedStatus).toBe("AT_RISK");
  });

  it("ON_HOLD takes priority over OFF_TRACK majority", () => {
    const result = calculateObjectiveHealth(["OFF_TRACK", "OFF_TRACK", "ON_HOLD"]);
    expect(result.computedStatus).toBe("AT_RISK");
  });

  it("returns null when all children are ON_TRACK", () => {
    const result = calculateObjectiveHealth(["ON_TRACK", "ON_TRACK", "ON_TRACK"]);
    expect(result.computedStatus).toBeNull();
  });

  it("includes a reason string when status is computed", () => {
    const result = calculateObjectiveHealth(["ON_HOLD"]);
    expect(result.reason).toBeTruthy();
  });
});

describe("getObjectiveChildStatuses", () => {
  it("returns KR statuses for DIRECT_KRS source", () => {
    const objective = {
      progressSource: "DIRECT_KRS" as const,
      keyResults: [{ status: "ON_TRACK" as const }, { status: "OFF_TRACK" as const }],
      parentAssignments: [],
    };
    expect(getObjectiveChildStatuses(objective)).toEqual(["ON_TRACK", "OFF_TRACK"]);
  });

  it("returns KR statuses for MANUAL source", () => {
    const objective = {
      progressSource: "MANUAL" as const,
      keyResults: [{ status: "COMPLETED" as const }],
      parentAssignments: [],
    };
    expect(getObjectiveChildStatuses(objective)).toEqual(["COMPLETED"]);
  });

  it("returns ACTIVE/APPROVED child objective statuses for CHILD_OBJECTIVES source", () => {
    const objective = {
      progressSource: "CHILD_OBJECTIVES" as const,
      keyResults: [],
      parentAssignments: [
        { status: "ACTIVE", assignedObjective: { status: "ON_TRACK" as const } },
        { status: "APPROVED", assignedObjective: { status: "OFF_TRACK" as const } },
        { status: "PENDING_REVIEW", assignedObjective: { status: "DRAFT" as const } },
        { status: "ACTIVE", assignedObjective: null },
      ],
    };
    const statuses = getObjectiveChildStatuses(objective);
    expect(statuses).toEqual(["ON_TRACK", "OFF_TRACK"]);
  });

  it("excludes pending/rejected assignments from CHILD_OBJECTIVES source", () => {
    const objective = {
      progressSource: "CHILD_OBJECTIVES" as const,
      keyResults: [],
      parentAssignments: [
        { status: "PENDING_PROPOSAL", assignedObjective: { status: "AT_RISK" as const } },
        { status: "REJECTED", assignedObjective: { status: "OFF_TRACK" as const } },
      ],
    };
    expect(getObjectiveChildStatuses(objective)).toHaveLength(0);
  });
});
