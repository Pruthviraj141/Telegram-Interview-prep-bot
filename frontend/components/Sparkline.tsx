export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 3) return null;

  const w = 120;
  const h = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const latest = values[values.length - 1];
  const points = values
    .map(
      (v, i) =>
        `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`,
    )
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={`Score trend over ${values.length} rounds, latest ${latest.toFixed(1)} out of 5`}
      className="h-8 w-30 text-accent"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
