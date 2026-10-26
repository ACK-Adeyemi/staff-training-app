import { useId, useState, type ReactNode } from 'react';
import { focusClasses } from './Button';

export interface CollapsibleProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function Collapsible({ title, defaultOpen = false, children }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <div className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((o) => !o);
        }}
        className={`flex min-h-[var(--target-min)] w-full cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-md)] px-4 py-2 text-start font-semibold ${focusClasses}`}
      >
        <span>{title}</span>
        <svg
          aria-hidden="true"
          focusable="false"
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={open ? 'rotate-180' : undefined}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div id={panelId} hidden={!open} className="px-4 pb-4">
        {children}
      </div>
    </div>
  );
}
