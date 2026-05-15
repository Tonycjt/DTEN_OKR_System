import type { PacingStatus, PriorityStatus, WeeklyReportStatus, WeeklyTaskStatus, WorkStatus } from "@prisma/client";

export function workStatusTone(status: WorkStatus) {
  if (status === "COMPLETED" || status === "ON_TRACK") {
    return "success";
  }

  if (status === "AT_RISK" || status === "ON_HOLD") {
    return "warning";
  }

  if (status === "OFF_TRACK") {
    return "danger";
  }

  return "neutral";
}

export function pacingStatusTone(status: PacingStatus) {
  if (status === "ON_PACE") {
    return "success";
  }

  if (status === "BEHIND") {
    return "danger";
  }

  if (status === "NO_UPDATE") {
    return "warning";
  }

  return "neutral";
}

export function weeklyReportStatusTone(status: WeeklyReportStatus) {
  if (status === "REVIEWED") {
    return "success";
  }

  if (status === "SUBMITTED" || status === "NEEDS_FOLLOW_UP") {
    return "warning";
  }

  if (status === "OVERDUE") {
    return "danger";
  }

  return "neutral";
}

export function priorityStatusTone(status: PriorityStatus) {
  if (status === "DONE") {
    return "success";
  }

  if (status === "IN_PROGRESS") {
    return "info";
  }

  if (status === "BLOCKED") {
    return "danger";
  }

  return "neutral";
}

export function weeklyTaskStatusTone(status: WeeklyTaskStatus) {
  if (status === "COMPLETED") return "success";
  if (status === "IN_PROGRESS") return "info";
  if (status === "BLOCKED") return "danger";
  if (status === "CANCELLED") return "neutral";
  return "neutral";
}
