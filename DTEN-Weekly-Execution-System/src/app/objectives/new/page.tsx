import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default function NewObjectivePage() {
  return (
    <div className="stack">
      <PageHeader title="Create Objective" description="Objective creation form scaffold for the OKR management milestone." />
      <Card>
        <CardHeader>
          <h2>Objective Details</h2>
          <p>Release 1 will support company, department, team, and individual objectives.</p>
        </CardHeader>
        <CardContent>
          <form className="form-shell">
            <label className="field">
              <span>Title</span>
              <input placeholder="Deliver predictable revenue growth" />
            </label>
            <label className="field">
              <span>Level</span>
              <select defaultValue="Company">
                <option>Company</option>
                <option>Department</option>
                <option>Team</option>
                <option>Individual</option>
              </select>
            </label>
            <Button type="button">Save Objective</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
