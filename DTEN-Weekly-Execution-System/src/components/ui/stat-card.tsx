import { Badge } from "@/components/ui/badge";

export function StatCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <div className="stat-card">
      <div className="stat-card-topline">
        <span>{label}</span>
        <Badge tone={tone}>{detail}</Badge>
      </div>
      <strong>{value}</strong>
    </div>
  );
}
