import { RoutePlaceholder } from "@/components/ui/route-placeholder";

export default function TeamsPage() {
  return (
    <RoutePlaceholder
      title="Teams"
      description="Admin area for team records, team membership, and manager assignments."
      requirements={["Create teams", "Edit teams", "View teams", "Assign users to teams"]}
    />
  );
}
