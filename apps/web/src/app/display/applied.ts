// Puts display settings on the html element, and keeps a copy of what was applied on this device so a reload
// shows the right text size and colours before the saved settings have loaded (no flash of the wrong theme).
// The data layer stays the source of truth: the provider replaces this copy as soon as the saved settings load.
import type { DisplayAttributes } from '@sta/domain';

const KEY = 'sta.display.applied';

export function applyToHtml({ attributes, variables }: DisplayAttributes): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(attributes)) root.setAttribute(name, value);
  for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
}

export function rememberApplied(applied: DisplayAttributes): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(applied));
  } catch {
    // Storage can be blocked; the saved settings still apply once they load.
  }
}

const isStringMap = (v: unknown): v is Record<string, string> =>
  typeof v === 'object' && v !== null && Object.values(v).every((x) => typeof x === 'string');

/** Run once, before the app renders. */
export function applyRemembered(): void {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed !== 'object' || parsed === null) return;
    const { attributes, variables } = parsed as Record<string, unknown>;
    if (isStringMap(attributes) && isStringMap(variables)) applyToHtml({ attributes, variables });
  } catch {
    // Ignore a damaged copy.
  }
}

// Changes that are still being saved. If the page is reloaded before the save finishes, the change is saved at the next
// start, so a quick reload never loses a setting.
const PENDING_KEY = 'sta.display.pending';
type Pending = { userId: string; patch: Record<string, unknown> };

export function readPending(userId: string): Record<string, unknown> | undefined {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    const parsed = (raw ? JSON.parse(raw) : undefined) as Partial<Pending> | null | undefined;
    const patch = parsed?.patch;
    return parsed?.userId === userId && typeof patch === 'object' ? patch : undefined;
  } catch {
    return undefined;
  }
}

export function addPending(userId: string, patch: Record<string, unknown>): void {
  try {
    const value: Pending = { userId, patch: { ...readPending(userId), ...patch } };
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(value));
  } catch {
    // Storage can be blocked; the save itself still runs.
  }
}

export function clearPending(): void {
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing to clear.
  }
}
