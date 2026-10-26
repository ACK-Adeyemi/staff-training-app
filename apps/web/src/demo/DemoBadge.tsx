import { useEffect, useRef } from 'react';
import { focusClasses } from '@sta/ui';
import { useT } from '../app/hooks';

export const LONG_PRESS_MS = 600;

/** The Demo badge. Tap opens the Demo menu; holding for 600 ms opens the presenter panel. */
export function DemoBadge({ onTap, onLongPress }: { onTap: () => void; onLongPress: () => void }) {
  const t = useT();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);

  const onClick = () => {
    // The click that follows a long-press must not also open the menu.
    if (held.current) {
      held.current = false;
      return;
    }
    onTap();
  };

  return (
    <button
      type="button"
      data-testid="demo-badge"
      onClick={onClick}
      onPointerDown={() => {
        cancel();
        held.current = false;
        timer.current = setTimeout(() => {
          timer.current = null;
          held.current = true;
          onLongPress();
        }, LONG_PRESS_MS);
      }}
      onPointerUp={() => {
        cancel();
        // If no click follows (the finger slid off), do not swallow a later keyboard press.
        if (held.current) setTimeout(() => (held.current = false), 0);
      }}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
      className={`min-h-[var(--target-min)] min-w-[var(--target-min)] cursor-pointer rounded-[var(--radius-sm)] border-2 border-[var(--color-accent)] bg-[var(--color-surface)] px-3 text-sm font-semibold text-[var(--color-accent)] ${focusClasses}`}
    >
      {t('demo.badge')}
    </button>
  );
}
