import type { ReactNode } from 'react';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

export interface BannerProps {
  tone: BannerTone;
  title?: string;
  children: ReactNode;
  action?: { label: string; onClick: () => void };
}

const icons: Record<BannerTone, IconName> = { info: 'help', success: 'check', warning: 'alert', danger: 'x-circle' };
const borders: Record<BannerTone, string> = {
  info: 'border-[var(--color-accent)]',
  success: 'border-[var(--status-current)]',
  warning: 'border-[var(--status-expiring)]',
  danger: 'border-[var(--status-overdue)]',
};

/** A message with an icon and words, so the tone never relies on colour alone. */
export function Banner({ tone, title, children, action }: BannerProps) {
  return (
    <div
      role={tone === 'warning' || tone === 'danger' ? 'alert' : 'status'}
      data-tone={tone}
      className={`flex flex-wrap items-start gap-3 rounded-[var(--radius-md)] border-2 bg-[var(--color-surface)] p-3 text-[var(--color-text)] ${borders[tone]}`}
    >
      <Icon name={icons[tone]} size={24} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="m-0 font-bold">{title}</p> : null}
        <div>{children}</div>
      </div>
      {action ? (
        <Button variant="secondary" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
