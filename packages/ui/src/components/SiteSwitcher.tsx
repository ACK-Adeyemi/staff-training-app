import { useId } from 'react';
import { focusClasses } from './Button';

export interface SiteSwitcherProps {
  label: string;
  sites: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}

export function SiteSwitcher({ label, sites, value, onChange }: SiteSwitcherProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className={`min-h-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[var(--color-text)] ${focusClasses}`}
      >
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
