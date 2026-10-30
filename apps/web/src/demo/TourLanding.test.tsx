// M5 chunk 11 (F-3, D1 and the Demo menu): starting, cancelling, restarting and resuming a tour.
// Contract: Landing's 'Client tour' and 'Provider tour' are buttons. Pressing one shows 'This resets the demo' with
// 'Confirm' and 'Cancel'. Confirm calls demo.reset(), stores a fresh tour (index 0, status active) under
// localStorage 'sta.tour.v1' and navigates to step 1's route, where the tour overlay shows 'Tour, step 1 of M'.
// The Demo menu shows 'Restart tour' and 'Resume tour' while a tour is stored as active or skipped, and neither
// otherwise. Resume tour makes a skipped tour active again at its stored step. Restart tour asks the same question.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackA, trackB } from '@sta/content';
import { renderRoute } from '../test/harness';

const KEY = 'sta.tour.v1';

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
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const saved = () => JSON.parse(localStorage.getItem(KEY) ?? 'null') as Record<string, unknown> | null;

describe('D1 landing tour buttons', () => {
  it.each([
    ['Client tour', trackA, '/client', 9],
    ['Provider tour', trackB, '/provider', 7],
  ])('%s asks first, then resets and opens checkpoint 1', async (button, tour, path, count) => {
    const { demo, router } = await renderRoute('/', 'staff');
    await userEvent.click(await screen.findByRole('button', { name: button }));
    expect(screen.getByText('This resets the demo')).toBeTruthy();
    expect(demo.reset).not.toHaveBeenCalled();
    expect(saved()).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await screen.findByRole('complementary', { name: `Tour, step 1 of ${String(count)}` });
    expect(demo.reset).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe(path);
    expect(saved()).toMatchObject({ tourId: tour.id, stepCount: count, index: 0, status: 'active' });
  });

  it('Cancel changes nothing: no reset, no stored tour, still on the landing page', async () => {
    const { demo, router } = await renderRoute('/', 'staff');
    await userEvent.click(await screen.findByRole('button', { name: 'Client tour' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(demo.reset).not.toHaveBeenCalled();
    expect(saved()).toBeNull();
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByText('This resets the demo')).toBeNull();
    expect(screen.queryByRole('complementary', { name: /^Tour/ })).toBeNull();
  });

  it('Explore freely does not reset or start a tour', async () => {
    const { demo } = await renderRoute('/', 'staff');
    const explore = await screen.findByRole('region', { name: 'Explore freely' });
    expect(within(explore).getAllByRole('link')).toHaveLength(3);
    expect(demo.reset).not.toHaveBeenCalled();
    expect(saved()).toBeNull();
  });

  it('replaces an older tour in storage when a different tour is started', async () => {
    localStorage.setItem(KEY, JSON.stringify({ tourId: trackA.id, stepCount: 9, index: 6, status: 'active' }));
    await renderRoute('/', 'staff');
    await userEvent.click(await screen.findByRole('button', { name: 'Provider tour' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await screen.findByRole('complementary', { name: 'Tour, step 1 of 7' });
    expect(saved()).toMatchObject({ tourId: trackB.id, index: 0 });
  });
});

describe('Demo menu tour items', () => {
  const openMenu = async () => {
    await userEvent.click(await screen.findByTestId('demo-badge'));
    return screen.getByRole('dialog', { name: 'Demo menu' });
  };

  it('offers neither Restart tour nor Resume tour when no tour has been started', async () => {
    await renderRoute('/client', 'client');
    const menu = await openMenu();
    expect(within(menu).queryByRole('button', { name: 'Restart tour' })).toBeNull();
    expect(within(menu).queryByRole('button', { name: 'Resume tour' })).toBeNull();
  });

  it('offers both while a tour is in progress', async () => {
    localStorage.setItem(KEY, JSON.stringify({ tourId: trackA.id, stepCount: 9, index: 2, status: 'active' }));
    await renderRoute('/client', 'client');
    const menu = await openMenu();
    expect(within(menu).getByRole('button', { name: 'Restart tour' })).toBeTruthy();
    expect(within(menu).getByRole('button', { name: 'Resume tour' })).toBeTruthy();
  });

  it('Resume tour brings back a skipped tour at the step it was on', async () => {
    localStorage.setItem(KEY, JSON.stringify({ tourId: trackA.id, stepCount: 9, index: 3, status: 'skipped' }));
    await renderRoute('/client', 'client');
    const menu = await openMenu();
    await userEvent.click(within(menu).getByRole('button', { name: 'Resume tour' }));
    await screen.findByRole('complementary', { name: 'Tour, step 4 of 9' });
    expect(saved()).toMatchObject({ index: 3, status: 'active' });
  });

  it('Restart tour asks first, then resets and opens step 1 of the same tour', async () => {
    localStorage.setItem(KEY, JSON.stringify({ tourId: trackB.id, stepCount: 7, index: 5, status: 'active' }));
    const { demo, router } = await renderRoute('/provider/pricing', 'provider');
    const menu = await openMenu();
    await userEvent.click(within(menu).getByRole('button', { name: 'Restart tour' }));
    expect(screen.getByText('This resets the demo')).toBeTruthy();
    expect(demo.reset).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await screen.findByRole('complementary', { name: 'Tour, step 1 of 7' });
    expect(demo.reset).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(trackB.steps[0]!.route);
    });
  });
});
