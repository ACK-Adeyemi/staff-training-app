// What a ticket or feedback note sends along by default (brief 25.3). Short plain words, never the raw browser string.
import type { MessageKey, TFunction } from '@sta/content';

export const CONTEXT_ITEMS = ['screen', 'device', 'role', 'version'] as const;
export type ContextKey = (typeof CONTEXT_ITEMS)[number];
export const contextLabelKey = (k: ContextKey): MessageKey => `tickets.context.${k}` as MessageKey;

const BROWSERS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

/** For example "Phone, Chrome". */
export function deviceSummary(t: TFunction): string {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const width = typeof window === 'undefined' ? 1024 : window.innerWidth;
  const kind = t(
    width < 600
      ? 'tickets.context.devicePhone'
      : width < 1024
        ? 'tickets.context.deviceTablet'
        : 'tickets.context.deviceComputer',
  );
  const browser = BROWSERS.find(([re]) => re.test(agent))?.[1];
  return browser ? `${kind}, ${browser}` : kind;
}

export function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
}
