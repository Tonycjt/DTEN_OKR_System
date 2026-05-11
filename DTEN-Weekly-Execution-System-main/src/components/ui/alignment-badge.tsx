import { Badge } from "@/components/ui/badge";

type AlignmentBadgeProps = {
  linked: boolean;
};

export function AlignmentBadge({ linked }: AlignmentBadgeProps) {
  return <Badge tone={linked ? "info" : "neutral"}>{linked ? "Linked" : "Unlinked"}</Badge>;
}
