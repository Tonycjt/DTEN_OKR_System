import type { KeyResult, TrackerLink, WeeklyPriority } from "@/types";

export function isValidTrackerUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:";
  } catch {
    return false;
  }
}

export function getTrackerLinksForKR(keyResult: KeyResult): TrackerLink[] {
  return keyResult.trackerLinks ?? [];
}

export function getTrackerLinksForWeeklyPriority(priority: WeeklyPriority): TrackerLink[] {
  return priority.trackerLinks ?? [];
}
