import { Icon, type IconName } from './Icon';
import { focusClasses } from './Button';

export interface ChipProps {
  label: string;
  icon?: IconName;
  /** Category colour token key, for example "cat-3". */
  colour?: string;
  onRemove?: () => void;
  /** Accessible name for the remove button, for example "Remove filter: Fire safety". */
  removeLabel?: string;
}

export function Chip({ label, icon, colour, onRemove, removeLabel }: ChipProps) {
  return (
    <span
      data-colour={colour}
      style={colour ? { borderColor: `var(--${colour}, var(--color-border))` } : undefined}
      className="inline-flex min-h-8 items-center gap-1 rounded-full border-2 border-[var(--color-border)] bg-[var(--color-surface)] ps-3 pe-3 text-sm font-semibold"
    >
      {icon ? <Icon name={icon} size={16} /> : null}
      <span>{label}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel ?? label}
          onClick={onRemove}
          className={`-me-3 ms-1 inline-flex min-h-[var(--target-min)] min-w-[var(--target-min)] cursor-pointer items-center justify-center rounded-full ${focusClasses}`}
        >
          <Icon name="x-circle" size={18} />
        </button>
      ) : null}
    </span>
  );
}
