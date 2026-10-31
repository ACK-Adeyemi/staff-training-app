import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { start } from '@sta/domain';
import { Button, Dialog } from '@sta/ui';
import { useDemo, useT } from '../app/hooks';
import { findTour, saveTour } from './tourStore';

/**
 * Starting or restarting a tour asks first ("This resets the demo"), then runs Reset demo, stores a fresh tour and
 * opens step 1. Render `dialog` anywhere in the caller's output and call `ask(tourId)` to open it.
 */
export function useTourStart(): { ask: (tourId: string) => void; dialog: ReactNode } {
  const t = useT();
  const demo = useDemo();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const tour = pending ? findTour(pending) : undefined;
  const cancel = () => {
    setPending(null);
  };
  const confirm = () => {
    const chosen = tour;
    setPending(null);
    if (!chosen) return;
    void (async () => {
      await demo.reset();
      // Open the route first, so the tour box appears on the page it talks about.
      await navigate(chosen.steps[0]?.route ?? '/');
      saveTour(start(chosen.id, chosen.steps.length));
      // The data was rebuilt in place, so anything already loaded is stale.
      await queryClient.invalidateQueries();
    })();
  };
  const dialog = (
    <Dialog open={tour !== undefined} title={t('tour.confirmTitle')} onClose={cancel}>
      {tour ? (
        <>
          <p className="mt-0 mb-2 font-semibold">{t('tour.resetsDemo')}</p>
          <p className="mt-0 mb-4">{t('tour.resetsDemoBody')}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={confirm}>{t('tour.confirm')}</Button>
            <Button variant="secondary" onClick={cancel}>
              {t('tour.cancel')}
            </Button>
          </div>
        </>
      ) : null}
    </Dialog>
  );
  return { ask: setPending, dialog };
}
