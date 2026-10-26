export interface StepperProps {
  current: number;
  total: number;
  /** Visible text, for example "Step 2 of 5". */
  label: string;
  /** Accessible name of the progress bar. */
  progressLabel: string;
}

export function Stepper({ current, total, label, progressLabel }: StepperProps) {
  const max = Math.max(1, total);
  const now = Math.min(max, Math.max(1, current));
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold">{label}</span>
      <div
        role="progressbar"
        aria-label={progressLabel}
        aria-valuemin={1}
        aria-valuemax={max}
        aria-valuenow={now}
        aria-valuetext={label}
        className="flex gap-1"
      >
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={[
              'h-2 flex-1 rounded-full border border-[var(--color-border)]',
              i < now ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-surface)]',
            ].join(' ')}
          />
        ))}
      </div>
    </div>
  );
}
