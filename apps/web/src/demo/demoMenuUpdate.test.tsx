// M5 chunk 4 (F-2): the Demo menu shows "Update available" beside the version only when the adapter reports needRefresh.
// Uses the same ./pwa fake as app/UpdatePrompt.test.tsx; language key pwa.updateAvailable = "Update available".
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '../test/harness';

const fake = vi.hoisted(() => ({
  state: { needRefresh: false, offlineReady: false },
  listeners: new Set<() => void>(),
}));
vi.mock('../app/pwa', () => ({
  register: () => ({
    getState: () => fake.state,
    subscribe: (l: () => void) => {
      fake.listeners.add(l);
      return () => fake.listeners.delete(l);
    },
    update: () => Promise.resolve(),
  }),
}));

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== 'function')
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
});
beforeEach(() => {
  fake.state = { needRefresh: false, offlineReady: false };
  fake.listeners.clear();
  vi.stubGlobal('__APP_VERSION__', '1.2.3');
  vi.stubGlobal('__BUILD_DATE__', '2026-10-19');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openMenu() {
  await userEvent.click(await screen.findByTestId('demo-badge'));
  return screen.getByRole('dialog', { name: 'Demo menu' });
}

describe('Demo menu update line', () => {
  it('shows no update line when no update is waiting', async () => {
    await renderRoute('/staff', 'staff');
    const menu = await openMenu();
    expect(within(menu).getByText('Version 1.2.3')).toBeTruthy();
    expect(within(menu).queryByText('Update available')).toBeNull();
  });

  it('shows "Update available" next to the version when needRefresh is true', async () => {
    fake.state = { needRefresh: true, offlineReady: false };
    await renderRoute('/staff', 'staff');
    const menu = await openMenu();
    const version = within(menu).getByText('Version 1.2.3');
    expect(within(menu).getByText('Update available')).toBeTruthy();
    expect(version.parentElement?.textContent).toContain('Update available');
  });

  it('adds the line while the menu is open when an update arrives', async () => {
    await renderRoute('/staff', 'staff');
    const menu = await openMenu();
    act(() => {
      fake.state = { needRefresh: true, offlineReady: false };
      fake.listeners.forEach((l) => {
        l();
      });
    });
    expect(await within(menu).findByText('Update available')).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'Escape' });
  });
});
