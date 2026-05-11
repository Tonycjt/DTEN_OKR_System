import type { TrackerLink, WeeklyPriority, WeeklyReport } from "@/types";

type WeeklyReportWithLegacyPriorityFallback = WeeklyReport & {
  weeklyPriorities?: WeeklyPriority[];
  nextWeekPriorities?: Array<string | undefined>;
};

export function getTopPriorities(report: WeeklyReportWithLegacyPriorityFallback): WeeklyPriority[] {
  return getReportPriorities(report).filter((priority) => priority.isTopPriority);
}

export function getAdditionalPriorities(report: WeeklyReportWithLegacyPriorityFallback): WeeklyPriority[] {
  return getReportPriorities(report).filter((priority) => !priority.isTopPriority);
}

export function getPrioritiesLinkedToKeyResults(report: WeeklyReportWithLegacyPriorityFallback): WeeklyPriority[] {
  return getReportPriorities(report).filter(
    (priority) => priority.priorityType === "linked_key_result" || Boolean(priority.linkedKeyResultId),
  );
}

export function getAdHocPriorities(report: WeeklyReportWithLegacyPriorityFallback): WeeklyPriority[] {
  return getReportPriorities(report).filter(
    (priority) => priority.priorityType === "ad_hoc" || !priority.linkedKeyResultId,
  );
}

export function getPriorityTrackerLinks(priority: WeeklyPriority): TrackerLink[] {
  return priority.trackerLinks ?? [];
}

function getReportPriorities(report: WeeklyReportWithLegacyPriorityFallback): WeeklyPriority[] {
  const structuredPriorities = report.weeklyPriorities ?? [];
  if (structuredPriorities.length > 0) {
    return sortPriorities(structuredPriorities);
  }

  return sortPriorities(
    (report.nextWeekPriorities ?? [])
      .filter((priorityText): priorityText is string => Boolean(priorityText?.trim()))
      .map((priorityText, index) => ({
        id: `${report.id}-legacy-priority-${index + 1}`,
        text: priorityText,
        priorityRank: index + 1,
        isTopPriority: index < 3,
        linkedKeyResultId: null,
        linkedObjectiveId: null,
        priorityType: "ad_hoc",
        trackerLinks: [],
        followUpStatus: null,
        followUpNote: null,
      })),
  );
}

function sortPriorities(priorities: WeeklyPriority[]) {
  return [...priorities].sort((a, b) => a.priorityRank - b.priorityRank);
}
