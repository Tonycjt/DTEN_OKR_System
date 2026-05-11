import { RoutePlaceholder } from "@/components/ui/route-placeholder";

export default function PendingReviewsPage() {
  return (
    <RoutePlaceholder
      title="Pending Reviews"
      description="Manager queue for submitted reports from direct reports."
      requirements={[
        "See submitted direct-report reports",
        "Open report detail",
        "Approve report",
        "Request follow-up",
        "Leave manager comment",
      ]}
    />
  );
}
