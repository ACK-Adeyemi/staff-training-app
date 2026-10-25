import { focusClasses } from '@sta/ui';
import { useT } from '../app/hooks';

/** The Demo badge. A button so the Demo menu can open from it (chunk 12). */
export function DemoBadge({ onClick }: { onClick?: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[var(--target-min)] min-w-[var(--target-min)] cursor-pointer rounded-[var(--radius-sm)] border-2 border-[var(--color-accent)] bg-[var(--color-surface)] px-3 text-sm font-semibold text-[var(--color-accent)] ${focusClasses}`}
    >
      {t('demo.badge')}
    </button>
  );
}
