// M5 review F-2: "Ready to work offline" shows once, as a polite status on the staff home only.
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '../../test/harness';
import { resetOfflineNotice } from './offlineNotice';

const fake = vi.hoisted(() => ({ state: { needRefresh: false, offlineReady: false } }));
vi.mock('../../app/pwa', () => ({
  register: () => ({
    getState: () => fake.state,
    subscribe: () => () => undefined,
    update: () => Promise.resolve(),
  }),
}));

beforeEach(() => {
  fake.state = { needRefresh: false, offlineReady: false };
  resetOfflineNotice();
});
afterEach(cleanup);

describe('Ready to work offline', () => {
  it('is hidden by default', async () => {
    await renderRoute('/staff', 'staff');
    await screen.findByText('1 to do');
    expect(screen.queryByText('Ready to work offline')).toBeNull();
  });

  it('shows as a status on the staff home when the worker is ready', async () => {
    fake.state = { needRefresh: false, offlineReady: true };
    await renderRoute('/staff', 'staff');
    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('Ready to work offline');
  });

  it('does not come back after it is closed or the page is mounted again', async () => {
    fake.state = { needRefresh: false, offlineReady: true };
    const first = await renderRoute('/staff', 'staff');
    await screen.findByText('Ready to work offline');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Ready to work offline')).toBeNull();
    first.unmount();
    await renderRoute('/staff', 'staff');
    await screen.findByText('1 to do');
    expect(screen.queryByText('Ready to work offline')).toBeNull();
  });

  it('is not shown on the client side', async () => {
    fake.state = { needRefresh: false, offlineReady: true };
    await renderRoute('/client', 'client');
    await screen.findByTestId('demo-badge');
    expect(screen.queryByText('Ready to work offline')).toBeNull();
  });
});
