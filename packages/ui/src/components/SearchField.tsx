import { useId, useRef } from 'react';
import { focusClasses } from './Button';
import { Icon } from './Icon';

export interface SearchFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  clearLabel: string;
  placeholder?: string;
}

export function SearchField({ label, value, onChange, clearLabel, placeholder }: SearchFieldProps) {
  const ref = useRef<HTMLInputElement>(null);
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <div className="relative flex items-center">
        <input
          ref={ref}
          id={id}
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          className={`min-h-[var(--target-min)] w-full rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-bg)] ps-3 pe-12 text-[var(--color-text)] ${focusClasses}`}
        />
        {value ? (
          <button
            type="button"
            aria-label={clearLabel}
            onClick={() => {
              onChange('');
              ref.current?.focus();
            }}
            className={`absolute end-0 inline-flex min-h-[var(--target-min)] min-w-[var(--target-min)] cursor-pointer items-center justify-center rounded-[var(--radius-md)] ${focusClasses}`}
          >
            <Icon name="x-circle" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
