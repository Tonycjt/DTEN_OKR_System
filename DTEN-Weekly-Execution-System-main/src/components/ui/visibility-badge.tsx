import { Badge } from "@/components/ui/badge";

type VisibilityBadgeProps = {
  visibility:
    | "Company-wide"
    | "Leadership-only"
    | "Team-only"
    | "Manager visibility"
    | "Private to owner + manager";
};

export function VisibilityBadge({ visibility }: VisibilityBadgeProps) {
  return <Badge tone={visibility === "Leadership-only" ? "info" : "neutral"}>{visibility}</Badge>;
}
