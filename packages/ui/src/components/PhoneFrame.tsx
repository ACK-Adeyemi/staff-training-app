import type { ReactNode } from 'react';
import { focusClasses } from './Button';

export interface PhoneFrameProps {
  title: string;
  children: ReactNode;
}

/** A 390px wide phone-sized preview. The inner region scrolls and can take keyboard focus. */
export function PhoneFrame({ title, children }: PhoneFrameProps) {
  return (
    <div
      data-phone-frame
      style={{ width: '390px', maxWidth: '100%' }}
      className="rounded-[var(--radius-lg)] border-4 border-[var(--color-text)] bg-[var(--color-bg)] p-2"
    >
      <div
        role="region"
        aria-label={title}
        tabIndex={0}
        className={`max-h-[640px] overflow-y-auto rounded-[var(--radius-md)] p-3 ${focusClasses}`}
      >
        {children}
      </div>
    </div>
  );
}
