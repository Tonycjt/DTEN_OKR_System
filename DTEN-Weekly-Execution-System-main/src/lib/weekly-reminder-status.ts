import type { OkrUpdateStatus, WeeklyReport } from "@/types";

export type WeeklyReminderStatus =
  | "Not started"
  | "Draft saved"
  | "Submitted"
  | "Partially updated"
  | "Missing / overdue"
  | "No active OKRs";

export function getWeeklyDraftStorageKey(userId: string, weekStartDate: string) {
  return `dten-weekly-update-draft:${userId}:${weekStartDate}`;
}

export function getSavedWeeklyDraftTimestamp(userId: string, weekStartDate: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const savedValue = window.localStorage.getItem(getWeeklyDraftStorageKey(userId, weekStartDate));
    if (!savedValue) {
      return null;
    }

    const parsedValue = JSON.parse(savedValue) as { savedAt?: string };
    return parsedValue.savedAt ?? null;
  } catch {
    return null;
  }
}

export function deriveWeeklyReminderStatus({
  report,
  okrUpdateStatus,
  hasSavedDraft,
  weekEndDate,
  today = new Date().toISOString().slice(0, 10),
}: {
  report?: WeeklyReport | null;
  okrUpdateStatus: OkrUpdateStatus;
  hasSavedDraft: boolean;
  weekEndDate: string;
  today?: string;
}): WeeklyReminderStatus {
  if (okrUpdateStatus === "No Active OKRs") {
    return "No active OKRs";
  }

  if (okrUpdateStatus === "Partially Updated") {
    return "Partially updated";
  }

  if (report?.submittedAt) {
    return "Submitted";
  }

  if (hasSavedDraft) {
    return "Draft saved";
  }

  if (today > weekEndDate) {
    return "Missing / overdue";
  }

  return "Not started";
}

export function getWeeklyReminderCta(status: WeeklyReminderStatus) {
  if (status === "Draft saved") return "Continue draft";
  if (status === "Submitted") return "View submitted update";
  if (status === "Partially updated") return "Finish missing OKR check-ins";
  if (status === "No active OKRs") return "View OKRs";
  return "Start weekly update";
}

export function weeklyReminderStatusTone(status: WeeklyReminderStatus) {
  if (status === "Submitted") return "success" as const;
  if (status === "Draft saved" || status === "Partially updated") return "warning" as const;
  if (status === "Missing / overdue") return "danger" as const;
  if (status === "No active OKRs") return "neutral" as const;
  return "info" as const;
}
