import { CHART_H, CHART_W, ChartShell, maxOf, type ChartProps } from './ChartShell';

export type BarChartProps = ChartProps;

export function BarChart(props: BarChartProps) {
  const { data } = props;
  const max = maxOf(data);
  const top = 20;
  const bottom = 28;
  const plotH = CHART_H - top - bottom;
  const slot = data.length ? CHART_W / data.length : CHART_W;
  const barW = Math.min(40, slot * 0.6);
  return (
    <ChartShell props={props}>
      <line x1={0} x2={CHART_W} y1={CHART_H - bottom} y2={CHART_H - bottom} stroke="currentColor" strokeWidth={1} />
      {data.map((d, i) => {
        const v = Number.isFinite(d.value) ? Math.max(0, d.value) : 0;
        const h = (v / max) * plotH;
        const x = i * slot + (slot - barW) / 2;
        const cx = i * slot + slot / 2;
        return (
          <g key={i}>
            <rect
              x={x}
              y={CHART_H - bottom - h}
              width={barW}
              height={h}
              fill="var(--color-accent)"
              stroke="currentColor"
              strokeWidth={1}
            />
            <text x={cx} y={CHART_H - bottom - h - 4} textAnchor="middle" fontSize={12} fill="currentColor">
              {d.value}
            </text>
            <text x={cx} y={CHART_H - 8} textAnchor="middle" fontSize={12} fill="currentColor">
              {d.label}
            </text>
          </g>
        );
      })}
    </ChartShell>
  );
}
