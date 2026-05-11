import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default function CurrentWeeklyReportPage() {
  return (
    <div className="stack">
      <PageHeader title="Current Weekly Report" description="Draft and submit the current Monday-Sunday weekly report." />
      <Card>
        <CardHeader>
          <h2>Weekly Priorities</h2>
          <p>Priorities will support KR-linked and ad-hoc work, with validation before submission.</p>
        </CardHeader>
        <CardContent>
          <form className="form-shell">
            <label className="field">
              <span>Priority</span>
              <textarea placeholder="Complete Microsoft Teams certification readiness review" />
            </label>
            <label className="field">
              <span>Type</span>
              <select defaultValue="KR_LINKED">
                <option value="KR_LINKED">KR-linked</option>
                <option value="AD_HOC">Ad-hoc</option>
              </select>
            </label>
            <Button type="button">Save Draft</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
