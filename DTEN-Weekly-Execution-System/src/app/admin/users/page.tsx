import { PlaceholderTable } from "@/components/ui/placeholder-table";
import { RoutePlaceholder } from "@/components/ui/route-placeholder";

export default function UsersPage() {
  return (
    <div className="stack">
      <RoutePlaceholder
        title="Users"
        description="Admin area for creating, editing, viewing, and assigning users to departments, teams, managers, and roles."
        requirements={["Create users", "Edit users", "Assign role", "Assign department/team", "Assign manager relationship"]}
      />
      <PlaceholderTable
        columns={["Name", "Role", "Department", "Manager"]}
        rows={[
          { Name: "CEO User", Role: "CEO", Department: "Executive", Manager: "None" },
          { Name: "Manager User", Role: "Manager", Department: "Product Engineering", Manager: "Department Head" },
        ]}
      />
    </div>
  );
}
