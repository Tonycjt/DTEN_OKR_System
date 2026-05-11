import { RoutePlaceholder } from "@/components/ui/route-placeholder";

export default function ReviewHistoryPage() {
  return (
    <RoutePlaceholder
      title="Review History"
      description="Manager history of reviewed reports and follow-up decisions."
      requirements={["Reviewed reports", "Follow-up decisions", "Risk flags", "Manager comments"]}
    />
  );
}
