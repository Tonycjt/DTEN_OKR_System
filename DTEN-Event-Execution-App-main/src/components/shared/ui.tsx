import { CheckCircle2, CircleAlert, CircleX, FileCheck2, Info, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { EventStage, EventStatus } from "../../types";
import type { ScorecardStatus } from "../../lib/scorecard";

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="section-heading">{title}</h2>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

export function Metric({ title, value, detail, icon: Icon }: { title: string; value: string; detail: string; icon: LucideIcon }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <Icon className="size-5 text-slate-400" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </div>
  );
}

export function EmptyState({ title, copy, action }: { title: string; copy: string; action?: ReactNode }) {
  return (
    <div className="spatial-empty-state rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <div className="mx-auto grid size-10 place-items-center rounded-lg bg-white text-slate-500 shadow-sm">
        <FileCheck2 className="size-5" />
      </div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{copy}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function SettingRow({ title, copy, enabled }: { title: string; copy: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{copy}</p>
      </div>
      <div className={`h-6 w-11 rounded-full p-1 ${enabled ? "bg-slate-950" : "bg-slate-200"}`}>
        <div className={`size-4 rounded-full bg-white transition ${enabled ? "translate-x-5" : ""}`} />
      </div>
    </div>
  );
}

export function SystemRow({ name, role, copy }: { name: string; role: string; copy: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{name}</h3>
        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{role}</span>
      </div>
      <p className="mt-2 text-sm leading-5 text-slate-600">{copy}</p>
    </div>
  );
}

export function ConfigRow({ title, meta, detail }: { title: string; meta: string; detail: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <StageBadge value={meta} />
      </div>
      <p className="mt-2 text-sm leading-5 text-slate-600">{detail}</p>
    </div>
  );
}

export function TagGrid({ items }: { items: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => <StageBadge key={item} value={item} />)}
    </div>
  );
}

type StatusTone = "success" | "warning" | "error" | "info" | "neutral";

function SemanticBadge({ tone, label, secondary = false }: { tone: StatusTone; label: string; secondary?: boolean }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? CircleAlert : tone === "error" ? CircleX : tone === "info" ? Info : FileCheck2;
  return (
    <span className={`status-badge status-${tone} ${secondary ? "status-badge-secondary" : ""}`}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

function getRiskTone(value: string): StatusTone {
  if (/healthy|ready|synced|uploaded|met|exceeded|complete|approved|done|on track/i.test(value)) return "success";
  if (/over budget|blocked|failed|rejected|conflict|suppressed/i.test(value)) return "error";
  if (/sync|ops|waiting|not due|simulation|technical|info/i.test(value)) return "info";
  if (/missing|behind|overdue|needs|risk|held|pending|review|close|editable|locked/i.test(value)) return "warning";
  return "neutral";
}

export function StatusBadge({ value }: { value: EventStatus }) {
  const tone: Record<EventStatus, StatusTone> = {
    "On Track": "success",
    "At Risk": "warning",
    Blocked: "error",
    Complete: "success",
  };
  return <SemanticBadge tone={tone[value]} label={value} />;
}

export function RiskBadge({ value, label }: { value: string; label?: string }) {
  return <SemanticBadge tone={getRiskTone(value)} label={label ?? value} secondary />;
}

export function StageBadge({ value }: { value: EventStage | string }) {
  return <SemanticBadge tone="neutral" label={value} secondary />;
}

export function ScorecardStatusBadge({ status }: { status: ScorecardStatus | string }) {
  const tone: Record<string, string> = {
    Exceeded: "Healthy",
    Met: "Healthy",
    Close: "Needs Review",
    Behind: "Behind Commitment",
    "Missing Data": "Missing Data",
    "Over Budget": "Over Budget",
    "Needs Explanation": "Needs Review",
  };
  return <RiskBadge value={tone[status] ?? "Needs Review"} label={status} />;
}
