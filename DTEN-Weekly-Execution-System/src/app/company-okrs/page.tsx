import { LinkButton } from "@/components/ui/button";
import { PlaceholderTable } from "@/components/ui/placeholder-table";
import { PageHeader } from "@/components/ui/page-header";

export default function CompanyOkrsPage() {
  return (
    <div className="stack">
      <PageHeader
        title="Company OKRs"
        description="Company, department, team, and individual objective hierarchy for Release 1."
        actions={<LinkButton href="/objectives/new">Create Objective</LinkButton>}
      />
      <PlaceholderTable
        columns={["Objective", "Level", "Owner", "Status", "Confidence"]}
        rows={[
          {
            Objective: "Deliver predictable revenue growth",
            Level: "Company",
            Owner: "CEO User",
            Status: "On Track",
            Confidence: "4/5",
          },
          {
            Objective: "Re-establish product and solution leadership",
            Level: "Company",
            Owner: "CEO User",
            Status: "At Risk",
            Confidence: "3/5",
          },
        ]}
      />
    </div>
  );
}
