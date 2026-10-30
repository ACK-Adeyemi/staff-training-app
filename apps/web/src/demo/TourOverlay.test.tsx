// M5 chunk 11 (F-3, D4): the self-guided tour overlay. Written before the implementation.
// Contract the implementer must provide:
//   TourOverlay rendered by RootLayout on every route while a tour is active. Progress lives in localStorage key
//   'sta.tour.v1' as the domain TourState JSON ({ tourId, stepCount, index, status }), parsed with Zod; anything
//   unreadable means "no tour". A stored tour with the right id whose stepCount or index does not fit starts again at step 1.
//   Landmark: role complementary named 'Tour, step N of M'. Inside: the step caption (from t(captionKey)), the text
//   'Step N of M', buttons 'Show me', 'Back', 'Next' (named 'Finish' on the last step is allowed), 'Skip tour',
//   'Restart', 'Collapse tour'. Collapsed: a pill button named 'Open tour, step N of M' and no landmark.
//   Restart and Landing's tour buttons ask 'This resets the demo' with buttons 'Confirm' and 'Cancel', then call demo.reset.
//   Show me: finds the person in demo.listPersonas() whose first name is step.persona, calls signInAsClient (client side)
//   or signInAs (staff side) with their userId (nothing for 'Provider'), then navigates to step.route.
//   After the last step: a list named 'Try this next' with one item per tryNext caption.
//   The page element with data-tour="<step.target>" gets data-tour-active="true" and a numbered marker
//   (data-testid="tour-marker", text = the step number). Both are removed on the next step.
//   With prefers-reduced-motion: reduce nothing inside the overlay carries an animate-* or transition* class.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createT, languages, trackA, trackB } from '@sta/content';
import { renderRoute, type Side } from '../test/harness';

const KEY = 'sta.tour.v1';
const t = createT(languages['en-GB'].messages);

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
});
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

type Tour = typeof trackA;
const store = (tour: Tour, index: number, status = 'active') => {
  localStorage.setItem(KEY, JSON.stringify({ tourId: tour.id, stepCount: tour.steps.length, index, status }));
};
const saved = () => JSON.parse(localStorage.getItem(KEY) ?? 'null') as Record<string, unknown> | null;
const label = (n: number, m: number) => `Tour, step ${String(n)} of ${String(m)}`;
const overlay = (n: number, m: number) => screen.findByRole('complementary', { name: label(n, m) });
const next = () => screen.getByRole('button', { name: /^(Next|Finish)$/ });
const pathOf = (r: { state: { location: { pathname: string } } }) => r.state.location.pathname;

async function open(tour: Tour, index: number, status = 'active') {
  store(tour, index, status);
  const step = tour.steps[index]!;
  const side: Side = step.route.startsWith('/provider')
    ? 'provider'
    : step.route.startsWith('/client')
      ? 'client'
      : 'staff';
  const view = await renderRoute(step.route.split('?')[0]!, side);
  return view;
}

describe('Tour overlay landmark and content', () => {
  it('is a complementary landmark named with the step number and the step count', async () => {
    await open(trackA, 2);
    const box = await overlay(3, 9);
    expect(within(box).getByText('Step 3 of 9')).toBeTruthy();
  });

  it('shows the caption for the current step in plain text', async () => {
    await open(trackA, 1);
    const box = await overlay(2, 9);
    expect(within(box).getByText(t(trackA.steps[1]!.captionKey as never))).toBeTruthy();
  });

  it('counts Track B out of 7', async () => {
    await open(trackB, 0);
    await overlay(1, 7);
  });

  it('is absent when no tour is stored', async () => {
    await renderRoute('/client', 'client');
    await screen.findByTestId('demo-badge');
    expect(screen.queryByRole('complementary', { name: /^Tour/ })).toBeNull();
  });

  it('is absent when the tour was skipped', async () => {
    await open(trackA, 1, 'skipped');
    await screen.findByTestId('demo-badge');
    expect(screen.queryByRole('complementary', { name: /^Tour/ })).toBeNull();
  });
});

describe('Tour progress storage', () => {
  it('starts again at step 1 when the stored index is out of range', async () => {
    store(trackA, 99);
    await renderRoute('/client', 'client');
    await overlay(1, 9);
  });

  it('starts again at step 1 when the stored step count does not match the tour', async () => {
    localStorage.setItem(KEY, JSON.stringify({ tourId: trackA.id, stepCount: 4, index: 2, status: 'active' }));
    await renderRoute('/client', 'client');
    await overlay(1, 9);
  });

  it.each([
    ['text that is not JSON', 'not json {'],
    ['a number', '7'],
    ['an object of the wrong shape', JSON.stringify({ tourId: 5, index: 'two' })],
    ['an unknown tour id', JSON.stringify({ tourId: 'nope', stepCount: 3, index: 1, status: 'active' })],
  ])('shows no tour and does not crash for %s', async (_n, raw) => {
    localStorage.setItem(KEY, raw);
    await renderRoute('/client', 'client');
    await screen.findByTestId('demo-badge');
    expect(screen.queryByRole('complementary', { name: /^Tour/ })).toBeNull();
  });

  it('saves the new step every time the person moves', async () => {
    await open(trackA, 0);
    await overlay(1, 9);
    await userEvent.click(next());
    await overlay(2, 9);
    expect(saved()).toMatchObject({ tourId: trackA.id, stepCount: 9, index: 1, status: 'active' });
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await overlay(1, 9);
    expect(saved()).toMatchObject({ index: 0, status: 'active' });
  });

  it('resumes at the stored step after a reload (a fresh render)', async () => {
    await open(trackB, 3);
    await overlay(4, 7);
    cleanup();
    await renderRoute('/provider/dunning', 'provider');
    await overlay(4, 7);
  });
});

describe('Tour buttons', () => {
  it('Next moves on without a timer and without leaving the page by itself', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { router } = await open(trackA, 0);
    await overlay(1, 9);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(screen.getByRole('complementary', { name: label(1, 9) })).toBeTruthy();
    expect(pathOf(router)).toBe('/client');
    vi.useRealTimers();
    await userEvent.click(next());
    await overlay(2, 9);
    expect(pathOf(router)).toBe('/client');
  });

  it('Back on the first step does nothing', async () => {
    await open(trackA, 0);
    await overlay(1, 9);
    const back = screen.getByRole<HTMLButtonElement>('button', { name: 'Back' });
    expect(back.disabled || back.getAttribute('aria-disabled') === 'true').toBe(true);
    await userEvent.click(back);
    await overlay(1, 9);
  });

  it('Skip tour removes the overlay and stores a skipped tour', async () => {
    await open(trackA, 4);
    await overlay(5, 9);
    await userEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: /^Tour/ })).toBeNull();
    });
    expect(saved()).toMatchObject({ tourId: trackA.id, index: 4, status: 'skipped' });
  });

  it('Restart asks first; Cancel leaves the tour and the demo untouched', async () => {
    const { demo } = await open(trackA, 4);
    await overlay(5, 9);
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(screen.getByText('This resets the demo')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(demo.reset).not.toHaveBeenCalled();
    await overlay(5, 9);
    expect(saved()).toMatchObject({ index: 4 });
  });

  it('Restart then Confirm runs Reset demo and goes back to step 1 on its route', async () => {
    const { demo, router } = await open(trackA, 4);
    await overlay(5, 9);
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await overlay(1, 9);
    expect(demo.reset).toHaveBeenCalledTimes(1);
    expect(saved()).toMatchObject({ tourId: trackA.id, index: 0, status: 'active' });
    expect(pathOf(router)).toBe(trackA.steps[0]!.route);
  });
});

describe('Show me', () => {
  it('jumps to a client admin and opens the step route', async () => {
    const { demo, router, keys } = await open(trackA, 5); // step 6: Priya, Module Builder
    await overlay(6, 9);
    await userEvent.click(screen.getByRole('button', { name: 'Show me' }));
    await waitFor(() => {
      expect(pathOf(router)).toBe(trackA.steps[5]!.route.split('?')[0]);
    });
    expect(demo.signInAsClient).toHaveBeenCalledWith(keys.users['priya']);
    expect(demo.signInAs).not.toHaveBeenCalled();
  });

  it('jumps to a staff member and opens the staff route', async () => {
    const { demo, router, keys } = await open(trackA, 2); // step 3: Jade
    await overlay(3, 9);
    // Start somewhere else so the navigation is visible.
    await router.navigate('/client');
    await userEvent.click(screen.getByRole('button', { name: 'Show me' }));
    await waitFor(() => {
      expect(pathOf(router)).toBe('/staff');
    });
    expect(demo.signInAs).toHaveBeenCalledWith(keys.users['jade']);
    expect(demo.signInAsClient).not.toHaveBeenCalled();
  });

  it('does not change person on the provider tour but still opens the route', async () => {
    const { demo, router } = await open(trackB, 4); // step 5: /provider/team
    await overlay(5, 7);
    await router.navigate('/provider');
    await userEvent.click(screen.getByRole('button', { name: 'Show me' }));
    await waitFor(() => {
      expect(pathOf(router)).toBe('/provider/team');
    });
    expect(demo.signInAs).not.toHaveBeenCalled();
    expect(demo.signInAsClient).not.toHaveBeenCalled();
  });

  it('keeps the tour on the same step after Show me', async () => {
    await open(trackA, 1);
    await overlay(2, 9);
    await userEvent.click(screen.getByRole('button', { name: 'Show me' }));
    await overlay(2, 9);
    expect(saved()).toMatchObject({ index: 1 });
  });
});

describe('Tour end', () => {
  it('Next on the last step shows the Try this next list from the tour definition', async () => {
    await open(trackB, trackB.steps.length - 1);
    await overlay(7, 7);
    await userEvent.click(next());
    const list = await screen.findByRole('list', { name: 'Try this next' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((i) => i.textContent)).toEqual(trackB.tryNext.map((k) => t(k as never)));
    expect(saved()).toMatchObject({ status: 'complete' });
  });

  it('Back from the end list returns to the last step', async () => {
    await open(trackA, 8);
    await overlay(9, 9);
    await userEvent.click(next());
    await screen.findByRole('list', { name: 'Try this next' });
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await overlay(9, 9);
  });
});

describe('Tour keyboard and collapse', () => {
  it('every button works from the keyboard with Enter and Space', async () => {
    await open(trackA, 0);
    await overlay(1, 9);
    next().focus();
    expect(document.activeElement).toBe(next());
    await userEvent.keyboard('{Enter}');
    await overlay(2, 9);
    screen.getByRole('button', { name: 'Back' }).focus();
    await userEvent.keyboard(' ');
    await overlay(1, 9);
    screen.getByRole('button', { name: 'Skip tour' }).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: /^Tour/ })).toBeNull();
    });
  });

  it('keeps every control in the normal tab order, in a sensible order', async () => {
    await open(trackA, 2);
    const box = await overlay(3, 9);
    const names = within(box)
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names).toEqual(expect.arrayContaining(['Show me', 'Back', 'Skip tour', 'Restart', 'Collapse tour']));
    for (const b of within(box).getAllByRole('button')) expect(b.tabIndex).toBeGreaterThanOrEqual(0);
  });

  it('Collapse tour shrinks to a pill and the pill opens it again, keeping the step', async () => {
    await open(trackA, 2);
    await overlay(3, 9);
    await userEvent.click(screen.getByRole('button', { name: 'Collapse tour' }));
    expect(screen.queryByRole('complementary', { name: /^Tour/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show me' })).toBeNull();
    const pill = screen.getByRole('button', { name: 'Open tour, step 3 of 9' });
    await userEvent.click(pill);
    await overlay(3, 9);
    expect(saved()).toMatchObject({ index: 2, status: 'active' });
  });

  it('uses no animation or transition classes when the person prefers reduced motion', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('prefers-reduced-motion'),
      media: q,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }));
    await open(trackA, 2);
    const box = await overlay(3, 9);
    await userEvent.click(screen.getByRole('button', { name: 'Collapse tour' }));
    const pill = screen.getByRole('button', { name: 'Open tour, step 3 of 9' });
    for (const el of [box, ...box.querySelectorAll('*'), pill]) {
      expect(el.getAttribute('class') ?? '', el.tagName).not.toMatch(/(^|\s)(animate-|transition)/);
    }
  });
});

describe('Tour target highlight', () => {
  it('marks the target element with a number and a thick outline attribute, not colour alone', async () => {
    await open(trackA, 0);
    await overlay(1, 9);
    const target = trackA.steps[0]!.target!;
    const el = await waitFor(() => {
      const found = document.querySelector(`[data-tour="${target}"]`);
      expect(found, `no element has data-tour="${target}" on the client dashboard`).not.toBeNull();
      return found as HTMLElement;
    });
    await waitFor(() => {
      expect(el.getAttribute('data-tour-active')).toBe('true');
    });
    const marker = screen.getByTestId('tour-marker');
    expect(marker.textContent).toBe('1');
    expect(document.querySelectorAll('[data-tour-active]')).toHaveLength(1);
  });

  it('drops the marker and the outline attribute when the tour is skipped', async () => {
    await open(trackB, 0);
    await overlay(1, 7);
    await waitFor(() => {
      expect(document.querySelector('[data-tour-active]')).not.toBeNull();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    await waitFor(() => {
      expect(document.querySelector('[data-tour-active]')).toBeNull();
    });
    expect(screen.queryByTestId('tour-marker')).toBeNull();
  });
});
