export interface LevelBarProps {
  value: number;
  max: number;
  /** Full sentence, for example "Level 4, 120 of 250 XP to level 5". Shown and used as the value text. */
  label: string;
}

export function LevelBar({ value, max, label }: LevelBarProps) {
  const m = Number.isFinite(max) && max > 0 ? max : 1;
  const v = Number.isFinite(value) ? Math.min(m, Math.max(0, value)) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={m}
        aria-valuenow={v}
        aria-valuetext={label}
        className="h-4 w-full overflow-hidden rounded-full border-2 border-[var(--color-border)] bg-[var(--color-surface)]"
      >
        <div className="h-full bg-[var(--color-accent)]" style={{ width: `${(v / m) * 100}%` }} />
      </div>
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
}
