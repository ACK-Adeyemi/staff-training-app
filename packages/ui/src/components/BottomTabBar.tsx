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
}

export function BottomTabBar({ label, items, currentId }: BottomTabBarProps) {
  return (
    <nav
      aria-label={label}
      className="fixed inset-x-0 bottom-0 border-t-2 border-[var(--color-border)] bg-[var(--color-bg)]"
    >
      <ul className="m-0 flex list-none justify-around p-0">
        {items.map((item) => (
          <li key={item.id} className="flex-1">
            <a
              href={item.href}
              aria-current={item.id === currentId ? 'page' : undefined}
              className={`flex min-h-[var(--target-min)] min-w-[var(--target-min)] flex-col items-center justify-center gap-1 px-2 py-1 text-xs aria-[current=page]:font-bold aria-[current=page]:text-[var(--color-accent)] aria-[current=page]:underline ${focusClasses}`}
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
