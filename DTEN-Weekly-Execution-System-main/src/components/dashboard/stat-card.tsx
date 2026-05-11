import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type StatCardProps = {
  label: string;
  value: string;
  tone: "neutral" | "success" | "warning" | "danger";
};

export function StatCard({ label, value, tone }: StatCardProps) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink-600">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-ink-950">{value}</p>
          </div>
          <Badge tone={tone}>Mock</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
