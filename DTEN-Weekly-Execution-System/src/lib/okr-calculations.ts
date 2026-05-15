import type { PacingStatus } from "@prisma/client";

export const MONTH_NAMES = [
  "January", "February", "March",
  "April", "May", "June",
  "July", "August", "September",
  "October", "November", "December",
] as const;

export function getQuarterMonthNames(quarter: string): [string, string, string] {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarter);
  if (!match) return ["Month 1", "Month 2", "Month 3"];
  const q = parseInt(match[2]);
  const start = (q - 1) * 3;
  return [MONTH_NAMES[start], MONTH_NAMES[start + 1], MONTH_NAMES[start + 2]];
}

export function getMonthIndexForQuarter(quarter: string, date = new Date()): number | null {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarter);
  if (!match) return null;
  const year = parseInt(match[1]);
  const q = parseInt(match[2]);
  const startCalendarMonth = (q - 1) * 3 + 1;
  if (date.getFullYear() !== year) return null;
  const offset = date.getMonth() + 1 - startCalendarMonth;
  if (offset < 0 || offset > 2) return null;
  return offset + 1;
}

export function calculateProgressPercent(startValue: number, currentValue: number, targetValue: number) {
  if (targetValue === startValue) {
    return currentValue >= targetValue ? 100 : 0;
  }

  const rawProgress = ((currentValue - startValue) / (targetValue - startValue)) * 100;
  return Math.max(0, Math.min(100, Math.round(rawProgress)));
}

export function getCurrentQuarterMonthIndex(date = new Date()) {
  const monthInQuarter = date.getMonth() % 3;
  return monthInQuarter + 1;
}

export function calculatePacingStatus({
  progressPercent,
  currentMonthTargetPercent,
}: {
  progressPercent: number;
  currentMonthTargetPercent?: number | null;
}): PacingStatus {
  if (currentMonthTargetPercent == null) {
    return "NO_TARGET";
  }

  return progressPercent >= currentMonthTargetPercent ? "ON_PACE" : "BEHIND";
}

export type WeightedProgressItem = {
  progressPercent: number;
  weightPercent: number | null | undefined;
};

export function calculateWeightedProgress(items: WeightedProgressItem[]) {
  const totalWeight = items.reduce((total, item) => total + (Number.isFinite(item.weightPercent) ? Number(item.weightPercent) : 0), 0);

  if (totalWeight <= 0) {
    return 0;
  }

  const weightedTotal = items.reduce((total, item) => {
    const weight = Number.isFinite(item.weightPercent) ? Number(item.weightPercent) : 0;
    return total + item.progressPercent * (weight / totalWeight);
  }, 0);

  return Math.max(0, Math.min(100, Math.round(weightedTotal)));
}
