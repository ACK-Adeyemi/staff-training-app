import { useId } from 'react';
import { focusClasses } from './Button';

export interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible state words, so state is never shown by position or colour alone. */
  onLabel: string;
  offLabel: string;
  disabled?: boolean;
}

export function Switch({ label, checked, onChange, onLabel, offLabel, disabled }: SwitchProps) {
  const labelId = useId();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span id={labelId} className="font-semibold">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={() => {
          onChange(!checked);
        }}
        className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-2 rounded-full border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${focusClasses}`}
      >
        <span
          aria-hidden="true"
          className={`flex h-6 w-11 items-center rounded-full border-2 border-[var(--color-text)] px-0.5 ${checked ? 'justify-end bg-[var(--color-accent)]' : 'justify-start bg-transparent'}`}
        >
          <span className="h-4 w-4 rounded-full bg-[var(--color-text)]" />
        </span>
        <span>{checked ? onLabel : offLabel}</span>
      </button>
    </div>
  );
}
