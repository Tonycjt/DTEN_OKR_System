import { RoutePlaceholder } from "@/components/ui/route-placeholder";

export default function MyOkrsPage() {
  return (
    <RoutePlaceholder
      title="My OKRs"
      description="Employee view for assigned objectives, KRs, current values, status, confidence, and pacing."
      requirements={[
        "View assigned objectives",
        "View assigned KRs",
        "Open objective details",
        "Open KR details",
        "Track status, confidence, and pacing separately",
      ]}
    />
  );
}
