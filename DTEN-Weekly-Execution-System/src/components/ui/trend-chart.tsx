type TrendPoint = {
  label: string;
  value: number;
};

function pathForPoints(points: TrendPoint[], maxValue: number) {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    const y = 100 - (points[0].value / maxValue) * 100;
    return `M 0 ${y} L 100 ${y}`;
  }

  return points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 100 - (point.value / maxValue) * 100;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

export function TrendChart({
  points,
  maxValue = 100,
  label,
}: {
  points: TrendPoint[];
  maxValue?: number;
  label: string;
}) {
  const path = pathForPoints(points, maxValue);

  return (
    <div className="trend-chart" aria-label={label}>
      <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100">
        <line className="trend-grid-line" x1="0" x2="100" y1="25" y2="25" />
        <line className="trend-grid-line" x1="0" x2="100" y1="50" y2="50" />
        <line className="trend-grid-line" x1="0" x2="100" y1="75" y2="75" />
        {path ? <path className="trend-line" d={path} /> : null}
        {points.map((point, index) => {
          const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
          const y = 100 - (point.value / maxValue) * 100;

          return <circle className="trend-point" cx={x} cy={y} key={`${point.label}-${index}`} r="2.4" />;
        })}
      </svg>
      <div className="trend-axis">
        <span>{points[0]?.label ?? "No data"}</span>
        <span>{points.at(-1)?.label ?? "No data"}</span>
      </div>
    </div>
  );
}
