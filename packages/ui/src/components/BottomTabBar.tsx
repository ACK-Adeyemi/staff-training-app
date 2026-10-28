import { Icon, type IconName } from './Icon';
import { focusClasses } from './Button';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: IconName;
}

export interface BottomTabBarProps {
  label: string;
  items: readonly NavItem[];
  currentId: string;
  /** Optional last item that opens a sheet with the rest of the navigation. */
  more?: { label: string; onClick: () => void };
}

export function BottomTabBar({ label, items, currentId, more }: BottomTabBarProps) {
  return (
    <nav
      aria-label={label}
      className="fixed inset-x-0 bottom-0 border-t-2 border-[var(--color-border)] bg-[var(--color-bg)]"
    >
      <ul className="m-0 flex list-none justify-around p-0">
        {items.map((item) => (
          <li key={item.id} className="min-w-0 flex-1">
            <a
              href={item.href}
              aria-current={item.id === currentId ? 'page' : undefined}
              className={`flex min-h-[var(--target-min)] min-w-[var(--target-min)] flex-col items-center justify-center gap-1 px-0 py-1 text-center text-[0.6875rem] [overflow-wrap:anywhere] aria-[current=page]:font-bold aria-[current=page]:text-[var(--color-accent)] aria-[current=page]:underline ${focusClasses}`}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </a>
          </li>
        ))}
        {more ? (
          <li className="min-w-0 flex-1">
            <button
              type="button"
              onClick={more.onClick}
              className={`flex min-h-[var(--target-min)] min-w-[var(--target-min)] w-full cursor-pointer flex-col items-center justify-center gap-1 px-0 py-1 text-center text-[0.6875rem] [overflow-wrap:anywhere] ${focusClasses}`}
            >
              <Icon name="more" />
              <span>{more.label}</span>
            </button>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
