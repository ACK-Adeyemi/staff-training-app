import { Icon } from './Icon';
import { VisuallyHidden } from './Layout';

export interface ProgressRingProps {
  percent: number;
  /** Visible text inside the ring, for example "3 of 5". */
  valueText: string;
  /** Full sentence for assistive technology. */
  description: string;
  /** Visible word shown with a tick at 100 percent. */
  completeLabel: string;
  size?: number;
}

export function ProgressRing({ percent, valueText, description, completeLabel, size = 96 }: ProgressRingProps) {
  const pct = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const done = pct >= 100;
  return (
    <div className="relative inline-flex flex-col items-center gap-1">
      <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
        <svg
          aria-hidden="true"
          focusable="false"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={stroke}
            opacity={0.4}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={done ? 'var(--status-current)' : 'var(--color-accent)'}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct / 100)}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-center text-sm font-semibold">
          {valueText}
        </span>
      </div>
      {done ? (
        <span className="inline-flex items-center gap-1 font-semibold text-[var(--status-current)]">
          <Icon name="check" />
          {completeLabel}
        </span>
      ) : null}
      <VisuallyHidden>{description}</VisuallyHidden>
    </div>
  );
}
