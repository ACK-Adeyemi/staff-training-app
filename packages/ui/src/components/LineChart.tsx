import { CHART_H, CHART_W, ChartShell, maxOf, type ChartProps } from './ChartShell';

export type LineChartProps = ChartProps;

export function LineChart(props: LineChartProps) {
  const { data } = props;
  const max = maxOf(data);
  const top = 22;
  const bottom = 28;
  const plotH = CHART_H - top - bottom;
  const slot = data.length ? CHART_W / data.length : CHART_W;
  const pts = data.map((d, i) => {
    const v = Number.isFinite(d.value) ? Math.max(0, d.value) : 0;
    return { x: i * slot + slot / 2, y: CHART_H - bottom - (v / max) * plotH, d };
  });
  return (
    <ChartShell props={props}>
      <line x1={0} x2={CHART_W} y1={CHART_H - bottom} y2={CHART_H - bottom} stroke="currentColor" strokeWidth={1} />
      {pts.length > 1 ? (
        <polyline
          points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={3}
          strokeLinejoin="round"
        />
      ) : null}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={5} fill="var(--color-bg)" stroke="currentColor" strokeWidth={2} />
          <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize={12} fill="currentColor">
            {p.d.value}
          </text>
          <text x={p.x} y={CHART_H - 8} textAnchor="middle" fontSize={12} fill="currentColor">
            {p.d.axisLabel ?? p.d.label}
          </text>
        </g>
      ))}
    </ChartShell>
  );
}
