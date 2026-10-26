import { Icon } from './Icon';

export interface ContrastCheckProps {
  foreground: string;
  background: string;
  label: string;
  ratioLabel: (ratio: string) => string;
  passText: string;
  failText: string;
  /** Smallest ratio that passes. Defaults to 4.5. */
  minimum?: number;
}

// Same WCAG 2.x formula as contrastRatio in @sta/domain. @sta/ui does not import the domain package, so it is repeated here.
function channel(hex: string, i: number): number {
  const c = parseInt(hex.slice(i, i + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}
function ratioOf(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function ContrastCheck({
  foreground,
  background,
  label,
  ratioLabel,
  passText,
  failText,
  minimum = 4.5,
}: ContrastCheckProps) {
  const ratio = ratioOf(foreground, background);
  const ok = ratio >= minimum;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        aria-hidden="true"
        style={{ color: foreground, background }}
        className="inline-flex h-[var(--target-min)] min-w-[var(--target-min)] flex-col items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border-2 border-[var(--color-border)]"
      >
        <span style={{ background: foreground }} className="block h-1 w-6" />
        <span style={{ background: foreground }} className="block h-1 w-4" />
      </span>
      <div className="flex flex-col">
        <span className="font-semibold">{label}</span>
        <span>{ratioLabel(ratio.toFixed(1))}</span>
      </div>
      <span
        className={`inline-flex items-center gap-1 font-bold ${ok ? 'text-[var(--status-current)]' : 'text-[var(--status-overdue)]'}`}
      >
        <Icon name={ok ? 'check' : 'x-circle'} />
        <span>{ok ? passText : failText}</span>
      </span>
    </div>
  );
}
