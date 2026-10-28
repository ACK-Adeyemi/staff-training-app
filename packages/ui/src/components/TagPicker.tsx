import { focusClasses } from './Button';

export interface TagPickerProps {
  legend: string;
  options: { id: string; label: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}

export function TagPicker({ legend, options, value, onChange }: TagPickerProps) {
  return (
    <div role="group" aria-label={legend} className="flex flex-col gap-2">
      <span aria-hidden="true" className="font-semibold">
        {legend}
      </span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id]);
              }}
              className={`inline-flex min-h-[var(--target-min)] min-w-[var(--target-min)] cursor-pointer items-center gap-2 rounded-full border-2 px-4 py-2 font-semibold ${focusClasses} ${on ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]'}`}
            >
              {on ? (
                <svg
                  aria-hidden="true"
                  focusable="false"
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m5 12 5 5 9-10" />
                </svg>
              ) : null}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
