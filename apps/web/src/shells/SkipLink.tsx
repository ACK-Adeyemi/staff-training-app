import type { MouseEvent } from 'react';
import { focusClasses } from '@sta/ui';
import { useT } from '../app/hooks';

/** First focusable element on a page: hidden until focused, then moves focus to <main> without changing the route. */
export function SkipLink() {
  const t = useT();
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const main = document.querySelector<HTMLElement>('main');
    if (!main) return;
    main.tabIndex = -1;
    main.focus();
  };
  return (
    <a
      href="#main"
      onClick={go}
      className={`sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:inline-flex focus:min-h-[var(--target-min)] focus:items-center focus:rounded-[var(--radius-md)] focus:border-2 focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:px-4 focus:py-2 focus:font-semibold focus:text-[var(--color-text)] focus:no-underline ${focusClasses}`}
    >
      {t('shell.skipToContent')}
    </a>
  );
}
