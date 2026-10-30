// Keyboard-only helpers (M5 chunk 13, BP-4). Nothing here uses the mouse.
import { expect, type Locator, type Page } from '@playwright/test';

/** Describes the focused element for failure messages. */
export const describeFocus = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return 'nothing';
    const label = el.getAttribute('aria-label') ?? el.textContent.trim().slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${label}"`;
  });

/** True when the focused element draws a ring: an outline, or a box shadow that is not "none". */
export const focusIsVisible = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return false;
    const s = getComputedStyle(el);
    const outline = parseFloat(s.outlineWidth) > 0 && s.outlineStyle !== 'none' && s.outlineColor !== 'transparent';
    const shadow = s.boxShadow !== 'none' && s.boxShadow !== '';
    return outline || shadow;
  });

/** Presses Tab (or Shift+Tab) until the target has focus, checking each stop is visible. Fails after `max` presses. */
export async function tabTo(page: Page, target: Locator, opts: { max?: number; back?: boolean } = {}): Promise<void> {
  const max = opts.max ?? 60;
  const key = opts.back ? 'Shift+Tab' : 'Tab';
  const handle = await target.elementHandle();
  for (let i = 0; i < max; i++) {
    if (await handle.evaluate((el) => el === document.activeElement)) {
      expect(await focusIsVisible(page), `focus ring on ${await describeFocus(page)}`).toBe(true);
      return;
    }
    await page.keyboard.press(key);
  }
  throw new Error(`tabTo: not reached after ${String(max)} presses; focus is on ${await describeFocus(page)}`);
}

/** Tabs through the page: focus must keep moving and every stop must show a ring. Returns the stops. */
export async function tabThrough(page: Page, count: number): Promise<string[]> {
  const stops: string[] = [];
  const hidden: string[] = [];
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Tab');
    const where = await describeFocus(page);
    stops.push(where);
    if (!(await focusIsVisible(page))) hidden.push(where);
  }
  expect(hidden, 'stops without a visible focus ring').toEqual([]);
  return stops;
}

/** No trap: after pressing Tab `count` times, more than a couple of different elements held focus. */
export async function expectNoTrap(page: Page, count = 40): Promise<void> {
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Tab');
    seen.add(await describeFocus(page));
  }
  expect(seen.size, 'focus moves on through the page').toBeGreaterThan(2);
}

/** Focus is inside the given container. */
export async function expectFocusWithin(container: Locator): Promise<void> {
  await expect
    .poll(() => container.evaluate((el) => el.contains(document.activeElement)), { message: 'focus is inside' })
    .toBe(true);
}

/** Focus is exactly on the given element. */
export async function expectFocused(page: Page, target: Locator, message: string): Promise<void> {
  await expect(target, message).toBeFocused();
}

/** Skip link: the first Tab on a fresh page lands on it, Enter moves focus into main, and the route is unchanged. */
export async function useSkipLink(page: Page): Promise<void> {
  const before = page.url();
  await page.keyboard.press('Tab');
  const link = page.getByRole('link', { name: 'Skip to main content' });
  await expect(link, 'skip link is the first stop').toBeFocused();
  expect(await focusIsVisible(page), 'skip link shows a focus ring').toBe(true);
  await page.keyboard.press('Enter');
  await expectFocusWithin(page.getByRole('main'));
  expect(page.url(), 'skip link does not change the route').toBe(before);
}

/** True when focus is inside the container. */
export const focusIsInside = (container: Locator): Promise<boolean> =>
  container.evaluate((el) => el.contains(document.activeElement));

/** Behind a modal: focus must never rest on a page element outside it (the document body, i.e. browser chrome, is fine). */
export async function expectNotBehind(container: Locator): Promise<void> {
  const behind = await container.evaluate(
    (el) => document.activeElement !== document.body && !el.contains(document.activeElement),
  );
  expect(behind, 'focus is not on an element behind the modal').toBe(false);
}
