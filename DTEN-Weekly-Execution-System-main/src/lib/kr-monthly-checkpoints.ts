import type { KeyResult, KRPacingStatus, MonthlyTarget } from "@/types";

const onPaceThreshold = 10;

export type KRPacingSummaryItem = {
  keyResult: KeyResult;
  currentTarget: MonthlyTarget | null;
  pacingStatus: KRPacingStatus;
  targetProgressPercent: number | null;
  deltaPercent: number | null;
};

export type KRPacingSummary = {
  totalCount: number;
  targetedCount: number;
  aheadCount: number;
  onPaceCount: number;
  behindCount: number;
  noTargetCount: number;
  onPaceOrAheadPercent: number;
  behindPercent: number;
  items: KRPacingSummaryItem[];
};

export function getCurrentMonthlyTarget(keyResult: KeyResult, currentDate: Date | string = new Date()): MonthlyTarget | null {
  const monthlyTargets = keyResult.monthlyTargets ?? [];
  if (monthlyTargets.length === 0) {
    return null;
  }

  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(toUtcDate(currentDate));
  return monthlyTargets.find((target) => normalizeMonthLabel(target.monthLabel) === normalizeMonthLabel(monthLabel)) ?? null;
}

export function getMonthlyTargetProgressStatus(keyResult: KeyResult, currentDate: Date | string = new Date()): KRPacingStatus {
  const currentTarget = getCurrentMonthlyTarget(keyResult, currentDate);
  if (!currentTarget) {
    return "No Target";
  }

  const targetProgressPercent = getMonthlyTargetProgressPercent(keyResult, currentTarget);
  const delta = keyResult.progressPercent - targetProgressPercent;

  if (delta > onPaceThreshold) {
    return "Ahead";
  }

  if (delta < -onPaceThreshold) {
    return "Behind";
  }

  return "On Pace";
}

export function deriveKRPacingStatus(keyResult: KeyResult, currentDate: Date | string = new Date()): KRPacingStatus {
  return getMonthlyTargetProgressStatus(keyResult, currentDate);
}

export function getKRPacingSummary(keyResults: KeyResult[], currentDate: Date | string = new Date()): KRPacingSummary {
  const items = keyResults.map((keyResult) => {
    const currentTarget = getCurrentMonthlyTarget(keyResult, currentDate);
    const targetProgressPercent = currentTarget ? getMonthlyTargetProgressPercent(keyResult, currentTarget) : null;
    const deltaPercent = targetProgressPercent === null ? null : keyResult.progressPercent - targetProgressPercent;

    return {
      keyResult,
      currentTarget,
      pacingStatus: deriveKRPacingStatus(keyResult, currentDate),
      targetProgressPercent,
      deltaPercent,
    };
  });

  const aheadCount = items.filter((item) => item.pacingStatus === "Ahead").length;
  const onPaceCount = items.filter((item) => item.pacingStatus === "On Pace").length;
  const behindCount = items.filter((item) => item.pacingStatus === "Behind").length;
  const noTargetCount = items.filter((item) => item.pacingStatus === "No Target").length;
  const targetedCount = items.length - noTargetCount;

  return {
    totalCount: items.length,
    targetedCount,
    aheadCount,
    onPaceCount,
    behindCount,
    noTargetCount,
    onPaceOrAheadPercent: targetedCount > 0 ? Math.round(((aheadCount + onPaceCount) / targetedCount) * 100) : 0,
    behindPercent: targetedCount > 0 ? Math.round((behindCount / targetedCount) * 100) : 0,
    items,
  };
}

export function getMonthlyTargetProgressPercent(keyResult: KeyResult, target: MonthlyTarget) {
  if (typeof target.targetProgressPercent === "number") {
    return clampPercent(target.targetProgressPercent);
  }

  if (typeof keyResult.targetValue === "number" && keyResult.targetValue !== 0) {
    return clampPercent((target.targetValue / keyResult.targetValue) * 100);
  }

  return clampPercent(target.targetValue);
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeMonthLabel(value: string) {
  return value.trim().toLowerCase();
}

function toUtcDate(value: Date | string) {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
