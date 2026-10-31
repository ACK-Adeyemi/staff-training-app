import { useState } from 'react';
import { Button } from '@sta/ui';
import { useT } from './hooks';
import { usePwa } from './usePwa';

/** A polite, non-blocking notice when a new version is waiting. It never updates or reloads by itself. */
export function UpdatePrompt() {
  const t = useT();
  const pwa = usePwa();
  const [hidden, setHidden] = useState(false);
  if (!pwa.needRefresh || hidden) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-20 z-50 md:bottom-0 m-3 flex flex-wrap items-center gap-3 rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[var(--color-text)] shadow-lg"
    >
      <span className="flex-1">{t('pwa.updateReady')}</span>
      <Button
        className="min-h-11"
        onClick={() => {
          void pwa.update();
        }}
      >
        {t('pwa.update')}
      </Button>
      <Button
        className="min-h-11"
        variant="secondary"
        onClick={() => {
          setHidden(true);
        }}
      >
        {t('pwa.later')}
      </Button>
    </div>
  );
}
