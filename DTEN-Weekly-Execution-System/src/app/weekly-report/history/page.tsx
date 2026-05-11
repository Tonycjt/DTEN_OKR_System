import { RoutePlaceholder } from "@/components/ui/route-placeholder";

export default function WeeklyReportHistoryPage() {
  return (
    <RoutePlaceholder
      title="Weekly Report History"
      description="Employee history of draft, submitted, reviewed, follow-up, and overdue weekly reports."
      requirements={["List previous reports", "Open report detail", "Show review result", "Show follow-up requests"]}
    />
  );
}
