import type { Confidence, Objective, ObjectiveStatus } from "@/types";

export type BreakdownItem = {
  label: string;
  count: number;
};

export function averageObjectiveScore(items: Objective[]) {
  if (items.length === 0) return 0;
  return Math.round(items.reduce((total, item) => total + item.score, 0) / items.length);
}

export function objectiveBreakdown<T extends "status" | "confidence">(items: Objective[], key: T): BreakdownItem[] {
  const counts = new Map<ObjectiveStatus | Confidence, number>();
  items.forEach((item) => counts.set(item[key], (counts.get(item[key]) ?? 0) + 1));
  return Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
}

export function formatBreakdown(items: BreakdownItem[]) {
  if (items.length === 0) return "None";
  return items.map((item) => `${item.label}: ${item.count}`).join(", ");
}
