import { Badge } from "@/components/ui/badge";

type ConfidenceBadgeProps = {
  confidence: "High" | "Medium" | "Low";
};

const confidenceTone = {
  High: "success",
  Medium: "warning",
  Low: "danger",
} as const;

export function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  return <Badge tone={confidenceTone[confidence]}>{confidence} confidence</Badge>;
}
