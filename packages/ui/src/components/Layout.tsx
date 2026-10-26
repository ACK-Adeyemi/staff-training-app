import type { HTMLAttributes, ReactNode } from 'react';
import { Icon } from './Icon';
import { Dialog } from './Dialog';
import type { NavItem } from './BottomTabBar';
import { focusClasses } from './Button';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={[
        'rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
}

export type BadgeTone = 'demo' | 'simulated' | 'neutral';
const tones: Record<BadgeTone, string> = {
  demo: 'border-[var(--color-accent)] text-[var(--color-accent)]',
  simulated: 'border-[var(--status-awaiting)] text-[var(--status-awaiting)]',
  neutral: 'border-[var(--color-border)] text-[var(--color-text-muted)]',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-sm)] border-2 bg-[var(--color-surface)] px-2 py-1 text-sm font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      {children}
    </div>
  );
}

export function SideNav({ label, items, currentId }: { label: string; items: readonly NavItem[]; currentId: string }) {
  return (
    <nav aria-label={label}>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={item.href}
              aria-current={item.id === currentId ? 'page' : undefined}
              className={`flex min-h-[var(--target-min)] items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 aria-[current=page]:bg-[var(--color-surface)] aria-[current=page]:font-bold aria-[current=page]:underline ${focusClasses}`}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Overflow navigation shown in a dialog on phones. */
export function MoreSheet({
  open,
  title,
  onClose,
  items,
  currentId,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  items: readonly NavItem[];
  currentId: string;
}) {
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <SideNav label={title} items={items} currentId={currentId} />
    </Dialog>
  );
}
