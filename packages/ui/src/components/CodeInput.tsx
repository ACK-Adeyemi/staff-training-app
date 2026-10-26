import { useId } from 'react';
import { focusClasses } from './Button';

export interface CodeInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function CodeInput({ label, value, onChange }: CodeInputProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="[0-9]*"
        value={value}
        onChange={(e) => {
          onChange(e.target.value.replace(/\D/g, '').slice(0, 6));
        }}
        className={`min-h-[var(--target-min)] w-full max-w-48 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-mono text-xl tracking-widest text-[var(--color-text)] ${focusClasses}`}
      />
    </div>
  );
}
