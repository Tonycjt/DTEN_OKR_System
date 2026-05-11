import { Badge } from "@/components/ui/badge";
import type { KeyResultStatus, ObjectiveStatus } from "@/types";

type StatusBadgeProps = {
  status: ObjectiveStatus | KeyResultStatus | "Pending Approval";
};

const statusTone = {
  Draft: "neutral",
  Active: "success",
  "On Track": "success",
  "At Risk": "warning",
  "Off Track": "danger",
  Completed: "info",
  "Not Started": "neutral",
  "On Hold": "warning",
  Archived: "neutral",
  "Pending Approval": "warning",
} as const;

export function StatusBadge({ status }: StatusBadgeProps) {
  return <Badge tone={statusTone[status]}>{status}</Badge>;
}
