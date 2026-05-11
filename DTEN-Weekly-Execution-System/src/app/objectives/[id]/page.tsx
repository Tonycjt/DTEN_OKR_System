import { RoutePlaceholder } from "@/components/ui/route-placeholder";

export default function ObjectiveDetailPage() {
  return (
    <RoutePlaceholder
      title="Objective Detail"
      description="Detail page for objective metadata, parent alignment, child KRs, progress, comments, and audit trail."
      requirements={["Objective summary", "Parent objective relationship", "Key Results under objective", "Owner and level", "Status history"]}
    />
  );
}
