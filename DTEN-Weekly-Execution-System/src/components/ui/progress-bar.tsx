export function ProgressBar({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, value));

  return (
    <div className="progress-track" aria-label={`${Math.round(width)} percent complete`}>
      <div className="progress-fill" style={{ width: `${width}%` }} />
    </div>
  );
}
