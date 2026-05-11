import type { PacingStatus } from "@prisma/client";

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
