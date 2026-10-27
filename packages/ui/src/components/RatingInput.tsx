import { useId } from 'react';

export interface RatingInputProps {
  legend: string;
  /** Five words, lowest first. */
  labels: string[];
  value: number | null;
  onChange: (n: number) => void;
}

export function RatingInput({ legend, labels, value, onChange }: RatingInputProps) {
  const name = useId();
  return (
    <fieldset role="radiogroup" className="m-0 border-0 p-0">
      <legend className="mb-2 font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {labels.slice(0, 5).map((label, i) => {
          const n = i + 1;
          return (
            <label
              key={n}
              className="relative inline-flex min-h-[var(--target-min)] min-w-[var(--target-min)] cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 has-[:checked]:border-[var(--color-accent)] has-[:checked]:bg-[var(--color-accent)] has-[:checked]:font-bold has-[:checked]:text-[var(--color-on-accent)] has-[:focus-visible]:outline-[length:3px] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-focus)]"
            >
              <input
                type="radio"
                name={name}
                value={n}
                aria-label={`${String(n)} ${label}`}
                checked={value === n}
                onChange={() => {
                  onChange(n);
                }}
                className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0"
              />
              <span aria-hidden="true">{n}</span>
              <span>{label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
