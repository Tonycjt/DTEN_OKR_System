import { Badge } from "@/components/ui/badge";
import type { ApprovalState } from "@/types";

type ApprovalStateBadgeProps = {
  approvalState: ApprovalState;
};

const approvalTone = {
  Draft: "neutral",
  "Pending Approval": "warning",
  Approved: "success",
  Rejected: "danger",
  "Changes Pending Re-approval": "warning",
  Archived: "neutral",
} as const;

export function ApprovalStateBadge({ approvalState }: ApprovalStateBadgeProps) {
  return <Badge tone={approvalTone[approvalState]}>{approvalState}</Badge>;
}
