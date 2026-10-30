import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { back, next, skip, stepNumber, type TourState } from '@sta/domain';
import type { Tour, TourStep } from '@sta/content';
import { focusClasses } from '@sta/ui';
import { useDemo, useT } from '../app/hooks';
import { saveTour, useStoredTour } from './tourStore';
import { useShortcut } from './useShortcut';
import { useTourStart } from './useTourStart';

// Plain buttons rather than the shared Button: this overlay must carry no transition or animation classes.
const buttonBase = `inline-flex min-h-[var(--target-min)] min-w-[var(--target-min)] items-center justify-center rounded-[var(--radius-md)] border-2 px-3 py-2 font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${focusClasses}`;
const primary = `${buttonBase} border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]`;
const secondary = `${buttonBase} border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]`;
const quiet = `${buttonBase} border-transparent bg-transparent text-[var(--color-accent)] underline`;

// Phone: docked at the bottom, above the tab bar. Desktop: a column at the right-hand side.
const dock =
  'fixed inset-x-2 bottom-20 z-30 md:inset-x-auto md:right-4 md:bottom-auto md:top-20 md:w-80 md:max-h-[calc(100dvh-6rem)]';
const SHORTCUT = 'Shift+Alt+KeyT';

type Spot = { top: number; left: number };

/** Finds the page element for the step, marks it and scrolls it into view. Returns where the number badge goes. */
function useHighlight(target: string | undefined, enabled: boolean): Spot | null {
  const [spot, setSpot] = useState<Spot | null>(null);
  useEffect(() => {
    if (!enabled || !target) return;
    let el: HTMLElement | null = null;
    const update = () => {
      const found = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
      if (found !== el) {
        el?.removeAttribute('data-tour-active');
        el = found;
        if (el) {
          el.setAttribute('data-tour-active', 'true');
          if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
        }
      }
      if (!el) {
        setSpot((s) => (s === null ? s : null));
        return;
      }
      const r = el.getBoundingClientRect();
      const top = Math.max(0, r.top + window.scrollY - 14);
      const left = Math.max(0, r.left + window.scrollX - 14);
      setSpot((s) => (s && s.top === top && s.left === left ? s : { top, left }));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      el?.removeAttribute('data-tour-active');
    };
  }, [target, enabled]);
  return enabled && target ? spot : null;
}

function Panel({ state, tour }: { state: TourState; tour: Tour }) {
  const t = useT();
  const demo = useDemo();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const box = useRef<HTMLElement>(null);
  const starter = useTourStart();
  const done = state.status === 'complete';
  const index = Math.min(state.index, tour.steps.length - 1);
  const step: TourStep | undefined = tour.steps[index];
  const n = stepNumber(state);
  const m = state.stepCount;
  const spot = useHighlight(step?.target, !done && !collapsed);

  const focusIn = useCallback(() => {
    setCollapsed(false);
    // After the overlay has rendered open.
    window.setTimeout(() => {
      box.current?.focus();
    }, 0);
  }, []);
  useShortcut(SHORTCUT, focusIn);

  if (!step) return null;
  const showMe = () => {
    void (async () => {
      if (step.persona !== 'Provider') {
        const side = step.route.startsWith('/client') ? 'client' : 'staff';
        const people = await demo.listPersonas();
        const who = people.find((p) => p.side === side && p.displayName.split(' ')[0] === step.persona);
        if (who) await (side === 'client' ? demo.signInAsClient(who.userId) : demo.signInAs(who.userId));
      }
      await navigate(step.route);
      // The person may have changed, so anything already loaded belongs to someone else.
      await queryClient.invalidateQueries();
    })();
  };
  const set = (s: TourState) => {
    saveTour(s);
  };

  if (collapsed) {
    return (
      <>
        <button
          type="button"
          className={`${primary} fixed right-2 bottom-20 z-30 md:right-4 md:bottom-4`}
          onClick={() => {
            setCollapsed(false);
          }}
        >
          {t('tour.openPill', { n, m })}
        </button>
        {starter.dialog}
      </>
    );
  }

  const label = done ? t('tour.landmarkDone') : t('tour.landmark', { n, m });
  return (
    <>
      <aside
        ref={box}
        tabIndex={-1}
        aria-label={label}
        aria-keyshortcuts="Shift+Alt+T"
        className={`${dock} overflow-y-auto rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[var(--color-text)] shadow-lg`}
      >
        {done ? (
          <>
            <h2 className="mt-0 mb-2 text-lg font-bold">{t('tour.doneTitle')}</h2>
            <ul aria-label={t('tour.tryNextTitle')} className="m-0 mb-3 list-disc pl-5">
              {tour.tryNext.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="m-0 mb-1 text-sm font-bold">{t('tour.stepOf', { n, m })}</p>
            <p className="mt-0 mb-3">{t(step.captionKey)}</p>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          {done ? null : (
            <button type="button" className={primary} onClick={showMe}>
              {t('tour.showMe')}
            </button>
          )}
          <button
            type="button"
            className={secondary}
            disabled={!done && state.index === 0}
            onClick={() => {
              set(back(state));
            }}
          >
            {t('tour.back')}
          </button>
          {done ? (
            <button
              type="button"
              className={primary}
              onClick={() => {
                saveTour(null);
              }}
            >
              {t('tour.closeTour')}
            </button>
          ) : (
            <button
              type="button"
              className={secondary}
              onClick={() => {
                set(next(state));
              }}
            >
              {index === tour.steps.length - 1 ? t('tour.finish') : t('tour.next')}
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {done ? null : (
            <button
              type="button"
              className={quiet}
              onClick={() => {
                set(skip(state));
              }}
            >
              {t('tour.skip')}
            </button>
          )}
          <button
            type="button"
            className={quiet}
            onClick={() => {
              starter.ask(tour.id);
            }}
          >
            {t('tour.restart')}
          </button>
          <button
            type="button"
            className={quiet}
            onClick={() => {
              setCollapsed(true);
            }}
          >
            {t('tour.collapse')}
          </button>
        </div>
        <p className="mt-2 mb-0 text-sm">{t('tour.shortcutHint')}</p>
      </aside>
      {starter.dialog}
      {spot
        ? createPortal(
            <span
              data-testid="tour-marker"
              aria-hidden="true"
              style={{ top: spot.top, left: spot.left }}
              className="absolute z-20 flex size-8 items-center justify-center rounded-full border-2 border-[var(--color-on-accent)] bg-[var(--color-accent)] text-sm font-bold text-[var(--color-on-accent)]"
            >
              {n}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}

/** The self-guided tour (D4). Not modal, collapsible, never moves on by itself. Mounted once by RootLayout. */
export function TourOverlay() {
  const stored = useStoredTour();
  if (!stored || stored.state.status === 'skipped') return null;
  return <Panel key={stored.tour.id} state={stored.state} tour={stored.tour} />;
}
