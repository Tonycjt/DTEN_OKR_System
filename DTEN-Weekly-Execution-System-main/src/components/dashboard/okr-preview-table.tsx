import { mockOkrRows } from "@/mock-data";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { VisibilityBadge } from "@/components/ui/visibility-badge";

export function OkrPreviewTable() {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-ink-950">Prototype OKR Preview</h2>
        <p className="mt-1 text-sm text-ink-600">Static rows for layout only. No OKR workflows are active yet.</p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-ink-600">
              <th className="pb-3 font-semibold">Objective</th>
              <th className="pb-3 font-semibold">Owner</th>
              <th className="pb-3 font-semibold">Visibility</th>
              <th className="pb-3 font-semibold">Status</th>
              <th className="pb-3 font-semibold">Confidence</th>
              <th className="pb-3 font-semibold">Progress</th>
            </tr>
          </thead>
          <tbody>
            {mockOkrRows.map((row) => (
              <tr key={row.title} className="border-b border-slate-100 last:border-0">
                <td className="max-w-64 py-4 font-semibold text-ink-950">{row.title}</td>
                <td className="py-4 text-ink-600">{row.owner}</td>
                <td className="py-4">
                  <VisibilityBadge visibility={row.visibility} />
                </td>
                <td className="py-4">
                  <StatusBadge status={row.status} />
                </td>
                <td className="py-4">
                  <ConfidenceBadge confidence={row.confidence} />
                </td>
                <td className="w-48 py-4">
                  <ProgressBar value={row.progress} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
