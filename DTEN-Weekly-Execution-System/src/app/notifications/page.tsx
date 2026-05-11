import { RoutePlaceholder } from "@/components/ui/route-placeholder";

export default function NotificationsPage() {
  return (
    <RoutePlaceholder
      title="Notifications"
      description="Minimal in-app notifications for submitted reports, manager reviews, follow-ups, and KR comments."
      requirements={[
        "Weekly report submitted to manager",
        "Manager requested follow-up",
        "Manager reviewed report",
        "CEO comment on KR",
      ]}
    />
  );
}
