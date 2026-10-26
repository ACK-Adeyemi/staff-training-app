import { useId, useState } from 'react';
import { focusClasses } from './Button';

export interface ColourFieldProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  hexLabel: string;
  pickerLabel: string;
  invalidText: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function ColourField({ label, value, onChange, hexLabel, pickerLabel, invalidText }: ColourFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  // When the value changes from outside (for example the colour picker), show it in the text box.
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const invalid = !HEX.test(draft);
  const field = `min-h-[var(--target-min)] rounded-[var(--radius-md)] border-2 bg-[var(--color-bg)] text-[var(--color-text)] ${focusClasses}`;
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1">
      <span aria-hidden="true" className="font-semibold">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="color"
          aria-label={pickerLabel}
          value={HEX.test(value) ? value.toLowerCase() : '#000000'}
          onChange={(e) => {
            onChange(e.target.value.toLowerCase());
          }}
          className={`${field} w-[var(--target-min)] cursor-pointer border-[var(--color-border)] p-1`}
        />
        <input
          type="text"
          aria-label={hexLabel}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-err` : undefined}
          value={draft}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            if (HEX.test(v)) onChange(v.toLowerCase());
          }}
          className={`${field} w-32 px-3 font-mono ${invalid ? 'border-[var(--status-overdue)]' : 'border-[var(--color-border)]'}`}
        />
      </div>
      {invalid ? (
        <p id={`${id}-err`} className="m-0 text-sm font-semibold text-[var(--status-overdue)]">
          {invalidText}
        </p>
      ) : null}
    </div>
  );
}
