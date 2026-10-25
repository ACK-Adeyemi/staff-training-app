// Chunk 12 (F-7, BP-2 D1 part): Demo badge, Demo menu, presenter panel (D2 skeleton), D1 and D3.
// Contract the implementer must provide (see the chunk 12 hand-off notes):
//   DemoBadge (button, data-testid="demo-badge", visible text "Demo") rendered on every screen including D1 and D3;
//   a tap opens the "Demo menu" dialog; a 600 ms pointer hold or Shift+Alt+P (event.code KeyP) opens the "Presenter panel" dialog;
//   DemoApi gains listOutbox(): Promise<OutboxMessage[]> for D3.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { fixedClock } from '@sta/domain';
import { AppProviders } from '../app/providers';
import { routes } from '../app/routes';
import { actorFor, makeDemo, renderRoute, seededStore, TODAY, type Side } from '../test/harness';

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
  vi.stubGlobal('__APP_VERSION__', '1.2.3');
  vi.stubGlobal('__BUILD_DATE__', '2026-10-19');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const openTitles = () =>
  [...document.querySelectorAll('dialog[open]')].map((d) => {
    const id = d.getAttribute('aria-labelledby');
    return (id ? document.getElementById(id)?.textContent : d.getAttribute('aria-label')) ?? '';
  });
const badge = () => screen.getByTestId('demo-badge');
const shiftAltP = () => fireEvent.keyDown(document.body, { key: 'P', code: 'KeyP', shiftKey: true, altKey: true });

async function openMenu() {
  await userEvent.click(badge());
  expect(openTitles()).toEqual(['Demo menu']);
  return screen.getByRole('dialog', { name: 'Demo menu' });
}

describe('Demo badge', () => {
  it.each<[string, Side]>([
    ['/', 'staff'],
    ['/demo/outbox', 'staff'],
    ['/staff', 'staff'],
    ['/client', 'client'],
    ['/provider', 'provider'],
    ['/no/such/page', 'staff'],
  ])('is a button on %s', async (path, side) => {
    await renderRoute(path, side);
    expect(await screen.findByTestId('demo-badge')).toHaveProperty('tagName', 'BUTTON');
    expect(screen.getByTestId('demo-badge').textContent).toContain('Demo');
  });
});

describe('Demo menu', () => {
  it('opens on a tap and shows the version, the build date and the current industry', async () => {
    await renderRoute('/staff', 'staff');
    const menu = await (async () => {
      await screen.findByTestId('demo-badge');
      return openMenu();
    })();
    expect(within(menu).getByText('Version 1.2.3')).toBeTruthy();
    expect(within(menu).getByText('Built on 2026-10-19')).toBeTruthy();
    expect(within(menu).getByText(/Nursery/)).toBeTruthy();
  });

  it('Change industry closes the menu and goes back to the landing page', async () => {
    const { router } = await renderRoute('/staff', 'staff');
    await screen.findByTestId('demo-badge');
    const menu = await openMenu();
    await userEvent.click(within(menu).getByRole('button', { name: 'Change industry' }));
    expect(router.state.location.pathname).toBe('/');
    expect(openTitles()).toEqual([]);
  });

  it('Open presenter panel replaces the menu with the presenter panel', async () => {
    await renderRoute('/staff', 'staff');
    await screen.findByTestId('demo-badge');
    const menu = await openMenu();
    await userEvent.click(within(menu).getByRole('button', { name: 'Open presenter panel' }));
    expect(openTitles()).toEqual(['Presenter panel']);
  });

  it('closes on Escape and returns focus to the badge', async () => {
    await renderRoute('/staff', 'staff');
    await screen.findByTestId('demo-badge');
    await openMenu();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Demo menu' }), { key: 'Escape' });
    expect(openTitles()).toEqual([]);
    expect(document.activeElement).toBe(badge());
  });
});

describe('Presenter panel shortcut and long-press', () => {
  it('Shift+Alt+P opens the presenter panel from anywhere', async () => {
    await renderRoute('/', 'staff');
    await screen.findByTestId('demo-badge');
    shiftAltP();
    expect(openTitles()).toEqual(['Presenter panel']);
  });

  it('Alt+P without Shift does nothing', async () => {
    await renderRoute('/', 'staff');
    await screen.findByTestId('demo-badge');
    fireEvent.keyDown(document.body, { key: 'p', code: 'KeyP', altKey: true });
    expect(openTitles()).toEqual([]);
  });

  it('holding the badge for 600 ms opens the presenter panel and not the menu', async () => {
    await renderRoute('/staff', 'staff');
    await screen.findByTestId('demo-badge');
    vi.useFakeTimers();
    fireEvent.pointerDown(badge());
    act(() => {
      vi.advanceTimersByTime(599);
    });
    expect(openTitles()).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(openTitles()).toEqual(['Presenter panel']);
    // The release after a long-press must not also open the menu behind it.
    fireEvent.pointerUp(badge());
    fireEvent.click(badge());
    expect(openTitles()).toEqual(['Presenter panel']);
  });

  it('a short press opens the menu, not the presenter panel', async () => {
    await renderRoute('/staff', 'staff');
    await screen.findByTestId('demo-badge');
    vi.useFakeTimers();
    fireEvent.pointerDown(badge());
    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.pointerUp(badge());
    fireEvent.click(badge());
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(openTitles()).toEqual(['Demo menu']);
  });

  it('moving the pointer away cancels the long-press', async () => {
    await renderRoute('/staff', 'staff');
    await screen.findByTestId('demo-badge');
    vi.useFakeTimers();
    fireEvent.pointerDown(badge());
    fireEvent.pointerLeave(badge());
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(openTitles()).toEqual([]);
  });
});

describe('Presenter panel (D2 skeleton)', () => {
  async function openPanel(side: Side = 'staff', path = '/staff') {
    const view = await renderRoute(path, side);
    await screen.findByTestId('demo-badge');
    shiftAltP();
    return { ...view, panel: screen.getByRole('dialog', { name: 'Presenter panel' }) };
  }

  it('shows the current app date in Europe/London', async () => {
    const { panel } = await openPanel();
    expect(within(panel).getByText(/Demo date: .*19 Oct(ober)? 2026/)).toBeTruthy();
  });

  it.each([
    [/^Fast-forward 1 days?$/, 1],
    [/^Fast-forward 7 days?$/, 7],
    [/^Fast-forward 30 days?$/, 30],
  ])('%s calls fastForward with the number of days', async (name, days) => {
    const { panel, demo } = await openPanel();
    await userEvent.click(within(panel).getByRole('button', { name }));
    expect(demo.fastForward).toHaveBeenCalledWith(days);
  });

  it('Back to today calls backToToday', async () => {
    const { panel, demo } = await openPanel();
    await userEvent.click(within(panel).getByRole('button', { name: 'Back to today' }));
    expect(demo.backToToday).toHaveBeenCalledTimes(1);
  });

  it('Reset demo asks for confirmation before it resets, and Cancel does nothing', async () => {
    const { panel, demo } = await openPanel();
    await userEvent.click(within(panel).getByRole('button', { name: 'Reset demo' }));
    expect(demo.reset).not.toHaveBeenCalled();
    expect(screen.getByText('Reset everything on this device?')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(demo.reset).not.toHaveBeenCalled();
    await userEvent.click(within(panel).getByRole('button', { name: 'Reset demo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, reset' }));
    expect(demo.reset).toHaveBeenCalledTimes(1);
  });

  it('shows Simulate failed payment, Toggle system status and Clear prospect branding as disabled with the later-build text', async () => {
    const { panel, demo } = await openPanel();
    for (const name of ['Simulate failed payment', 'Toggle system status', 'Clear prospect branding']) {
      const item = within(panel).getByRole('button', { name });
      expect(item.getAttribute('aria-disabled')).toBe('true');
      await userEvent.click(item);
    }
    expect(within(panel).getAllByText('Arrives in a later build')).toHaveLength(3);
    expect(demo.reset).not.toHaveBeenCalled();
  });

  it.each([
    ['Staff app', '/staff'],
    ['Client admin', '/client'],
    ['Provider admin', '/provider'],
  ])('Jump to %s goes to %s and closes the panel', async (name, path) => {
    const { panel, router } = await openPanel('staff', '/');
    await userEvent.click(within(panel).getByRole('link', { name }));
    expect(router.state.location.pathname).toBe(path);
    expect(openTitles()).toEqual([]);
  });

  it('Open the outbox goes to D3 and closes the panel', async () => {
    const { panel, router } = await openPanel();
    await userEvent.click(within(panel).getByRole('link', { name: 'Open the outbox' }));
    expect(router.state.location.pathname).toBe('/demo/outbox');
    expect(openTitles()).toEqual([]);
  });

  it('closes on Escape and returns focus to where it was opened from', async () => {
    const { panel } = await openPanel();
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(openTitles()).toEqual([]);
  });
});

describe('D1 landing', () => {
  it('has the heading, an honest note about what is simulated, and no navigation bar', async () => {
    await renderRoute('/', 'staff');
    expect(await screen.findByRole('heading', { level: 1, name: 'Choose what to look at' })).toBeTruthy();
    const note = screen.getByTestId('demo-honest-note');
    expect(note.textContent).toMatch(/simulated/i);
    expect(note.textContent).toMatch(/made-up|fictional/i);
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });

  it('offers Nursery (selected) and Luxury retail (disabled, arrives later)', async () => {
    const { demo } = await renderRoute('/', 'staff');
    const nursery = await screen.findByRole('radio', { name: 'Nursery' });
    const luxury = screen.getByRole('radio', { name: /Luxury retail/ });
    expect((nursery as HTMLInputElement).checked).toBe(true);
    expect((luxury as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Arrives in a later build')).toBeTruthy();
    await userEvent.click(luxury);
    expect(demo.setIndustry).not.toHaveBeenCalledWith('luxuryRetail');
  });

  it('Client tour, Provider tour and Explore freely lead to the three surfaces', async () => {
    await renderRoute('/', 'staff');
    expect((await screen.findByRole('link', { name: 'Client tour' })).getAttribute('href')).toBe('#/client');
    expect(screen.getByRole('link', { name: 'Provider tour' }).getAttribute('href')).toBe('#/provider');
    const explore = screen.getByRole('region', { name: 'Explore freely' });
    expect(
      within(explore)
        .getByRole('link', { name: /Staff app/ })
        .getAttribute('href'),
    ).toBe('#/staff');
    expect(
      within(explore)
        .getByRole('link', { name: /Client admin/ })
        .getAttribute('href'),
    ).toBe('#/client');
    expect(
      within(explore)
        .getByRole('link', { name: /Provider admin/ })
        .getAttribute('href'),
    ).toBe('#/provider');
  });
});

describe('D3 outbox', () => {
  it('shows the empty state when nothing has been sent', async () => {
    await renderRoute('/demo/outbox', 'staff');
    expect(await screen.findByRole('heading', { level: 1, name: 'Outbox' })).toBeTruthy();
    expect(
      await screen.findByText('Nothing has been sent yet. In the demo, messages are shown here instead of being sent.'),
    ).toBeTruthy();
  });

  it('lists a stored message with channel, to, subject, body, date and reason', async () => {
    const { handle, keys } = await seededStore();
    await handle.admin.bulkPut('outbox', [
      {
        id: '01HZZZZZZZZZZZZZZZZZZZZZZA',
        channel: 'email',
        to: 'jade@little-acorns.test',
        subject: 'Your safeguarding module is due',
        body: 'Please finish it this week.',
        at: '2026-10-19T08:30:00.000Z',
        reason: 'Reminder 7 days before due',
      },
    ]);
    const router = createMemoryRouter(routes, { initialEntries: ['/demo/outbox'] });
    render(
      <AppProviders
        store={handle.store}
        clock={fixedClock(TODAY)}
        actor={actorFor('staff', keys)}
        demo={{ ...makeDemo('staff', keys), listOutbox: () => handle.admin.listOutbox() }}
      >
        <RouterProvider router={router} />
      </AppProviders>,
    );
    expect(await screen.findByText('Your safeguarding module is due')).toBeTruthy();
    for (const text of [
      /email/i,
      'jade@little-acorns.test',
      'Please finish it this week.',
      'Reminder 7 days before due',
      /19 Oct(ober)? 2026/,
    ]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText(/Nothing has been sent yet/)).toBeNull();
  });
});
