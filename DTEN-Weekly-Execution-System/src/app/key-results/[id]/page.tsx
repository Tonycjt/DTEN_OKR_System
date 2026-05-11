import { RoutePlaceholder } from "@/components/ui/route-placeholder";

export default function KeyResultDetailPage() {
  return (
    <RoutePlaceholder
      title="Key Result Detail"
      description="Detail page for KR values, monthly targets, check-ins, confidence, status, and pacing."
      requirements={[
        "Current value and target value",
        "Monthly targets",
        "Check-in history",
        "Pacing status",
        "Latest blockers and notes",
      ]}
    />
  );
}
