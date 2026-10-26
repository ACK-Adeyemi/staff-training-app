import { useId } from 'react';

export interface SegmentedOption {
  value: string;
  label: string;
}
export interface SegmentedControlProps {
  legend: string;
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
}

/** Radio group drawn as joined buttons. Native radios give arrow-key movement; the selected one is also bold and ticked. */
export function SegmentedControl({ legend, options, value, onChange }: SegmentedControlProps) {
  const name = useId();
  return (
    <fieldset role="radiogroup" className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1 font-semibold">{legend}</legend>
      <div className="inline-flex flex-wrap overflow-hidden rounded-[var(--radius-md)] border-2 border-[var(--color-border)]">
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <label
              key={o.value}
              className={`relative flex min-h-[var(--target-min)] min-w-[var(--target-min)] cursor-pointer items-center justify-center px-4 py-2 has-[:focus-visible]:outline-[length:3px] has-[:focus-visible]:outline-solid has-[:focus-visible]:-outline-offset-3 has-[:focus-visible]:outline-[var(--color-focus)] ${selected ? 'bg-[var(--color-accent)] font-bold text-[var(--color-on-accent)]' : 'bg-[var(--color-surface)]'}`}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={selected}
                onChange={() => {
                  onChange(o.value);
                }}
                className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0"
              />
              <span className={selected ? 'underline underline-offset-4' : undefined}>{o.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
