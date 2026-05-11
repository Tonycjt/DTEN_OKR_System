import { RoutePlaceholder } from "@/components/ui/route-placeholder";

export default function DepartmentsPage() {
  return (
    <RoutePlaceholder
      title="Departments"
      description="Admin area for department hierarchy and department ownership."
      requirements={["Create departments", "Edit departments", "View departments", "Connect departments to users and teams"]}
    />
  );
}
