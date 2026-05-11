type ProgressBarProps = {
  value: number;
  label?: string;
};

export function ProgressBar({ value, label }: ProgressBarProps) {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-semibold text-ink-600">
        <span>{label ?? "Progress"}</span>
        <span>{clampedValue}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-dten-teal" style={{ width: `${clampedValue}%` }} />
      </div>
    </div>
  );
}
