// M5 chunk 4 (F-2, assumption 11): the update prompt. Written before the implementation.
//
// CONTRACT
//   ./UpdatePrompt exports UpdatePrompt (no props). It reads the adapter via usePwa() (./usePwa), which calls
//   register() from ./pwa, so tests replace ./pwa with a fake handle (see pwa.test.ts for the handle shape).
//   When needRefresh is false it renders nothing. When true it renders an element with role="status"
//   (polite, non-blocking: no dialog, no focus steal) containing the text "A new version is ready", a button
//   named "Update" (exactly the word, from pwa.update) and a button named "Later" (pwa.later). Both are at least 44px
//   (class min-h-11 or min-h-[44px]). Update calls handle.update() once. Later hides the prompt for this page load.
//   Nothing ever calls update() or location.reload() by itself.
// LANGUAGE KEYS (new `pwa` group in packages/content/src/lang/en-GB.json)
//   pwa.updateReady     "A new version is ready"
//   pwa.update          "Update"
//   pwa.later           "Later"
//   pwa.updateAvailable "Update available"        (Demo menu line)
//   pwa.offlineReady    "Ready to work offline"
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixedClock } from '@sta/domain';
import { AppProviders } from './providers';
import { UpdatePrompt } from './UpdatePrompt';
import { actorFor, makeDemo, seededStore, t, TODAY } from '../test/harness';

type State = { needRefresh: boolean; offlineReady: boolean };
const fake = vi.hoisted(() => {
  const f = {
    state: { needRefresh: false, offlineReady: false } as { needRefresh: boolean; offlineReady: boolean },
    listeners: new Set<() => void>(),
    update: undefined as unknown as ReturnType<typeof vi.fn>,
  };
  return f;
});
vi.mock('./pwa', () => ({
  register: () => ({
    getState: () => fake.state,
    subscribe: (l: () => void) => {
      fake.listeners.add(l);
      return () => fake.listeners.delete(l);
    },
    update: () => fake.update(),
  }),
}));

const setState = (s: State): void => {
  act(() => {
    fake.state = s;
    fake.listeners.forEach((l) => {
      l();
    });
  });
};

let reload: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fake.state = { needRefresh: false, offlineReady: false };
  fake.listeners.clear();
  fake.update = vi.fn(() => Promise.resolve());
  reload = vi.fn();
  vi.stubGlobal('location', { reload });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function mount() {
  const { handle, keys } = await seededStore();
  const router = createMemoryRouter([{ path: '/', element: <UpdatePrompt /> }]);
  return render(
    <AppProviders
      store={handle.store}
      clock={fixedClock(TODAY)}
      actor={actorFor('staff', keys)}
      demo={makeDemo('staff', keys)}
    >
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

describe('language keys', () => {
  it('the pwa group has the five strings in plain English', () => {
    expect(t('pwa.updateReady')).toBe('A new version is ready');
    expect(t('pwa.update')).toBe('Update');
    expect(t('pwa.later')).toBe('Later');
    expect(t('pwa.updateAvailable')).toBe('Update available');
    expect(t('pwa.offlineReady')).toBe('Ready to work offline');
  });
});

describe('UpdatePrompt', () => {
  it('shows nothing when no update is waiting', async () => {
    await mount();
    expect(screen.queryByText('A new version is ready')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
  });

  it('shows a polite status with an Update button as soon as needRefresh turns true', async () => {
    await mount();
    setState({ needRefresh: true, offlineReady: false });
    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('A new version is ready');
    expect(screen.getByRole('button', { name: 'Update' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('never updates or reloads on its own, even when it appears', async () => {
    await mount();
    setState({ needRefresh: true, offlineReady: false });
    await screen.findByRole('button', { name: 'Update' });
    await new Promise((r) => setTimeout(r, 50));
    expect(fake.update).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('tapping Update calls the adapter update once', async () => {
    await mount();
    setState({ needRefresh: true, offlineReady: false });
    await userEvent.click(await screen.findByRole('button', { name: 'Update' }));
    expect(fake.update).toHaveBeenCalledTimes(1);
  });

  it('Later hides the prompt without updating', async () => {
    await mount();
    setState({ needRefresh: true, offlineReady: false });
    await userEvent.click(await screen.findByRole('button', { name: 'Later' }));
    expect(screen.queryByText('A new version is ready')).toBeNull();
    expect(fake.update).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('can be reached and used with the keyboard alone (Tab to Update, Enter)', async () => {
    await mount();
    setState({ needRefresh: true, offlineReady: false });
    const update = await screen.findByRole('button', { name: 'Update' });
    await userEvent.tab();
    expect(
      document.activeElement === update || document.activeElement === screen.getByRole('button', { name: 'Later' }),
    ).toBe(true);
    update.focus();
    await userEvent.keyboard('{Enter}');
    expect(fake.update).toHaveBeenCalledTimes(1);
  });

  it('keeps both buttons at least 44px tall', async () => {
    await mount();
    setState({ needRefresh: true, offlineReady: false });
    for (const name of ['Update', 'Later']) {
      const btn = await screen.findByRole('button', { name });
      expect(btn.className, name).toMatch(/min-h-11|min-h-\[44px\]/);
    }
  });

  it('uses no payment wording', async () => {
    await mount();
    setState({ needRefresh: true, offlineReady: false });
    const status = await screen.findByRole('status');
    expect(status.textContent).not.toMatch(/pay|invoice|billing|subscription|price/i);
  });
});
