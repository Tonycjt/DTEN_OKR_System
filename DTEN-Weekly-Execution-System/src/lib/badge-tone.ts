import type { PacingStatus, WorkStatus } from "@prisma/client";

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
