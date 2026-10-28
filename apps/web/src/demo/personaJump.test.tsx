// M3 chunk 1: D2 "Jump to persona" (plan assumption 1). Written before the implementation.
// Contract the implementer must provide:
//   DemoApi gains listPersonas(): Promise<{ userId; displayName; side: 'client' | 'staff'; clientId; clientName }[]>
//   and signInAsClient(userId) (saves DemoState.clientPersona). The Presenter panel has a "Jump to persona" group
//   with one button per persona named "<display name>, <client name>". A client persona calls signInAsClient and goes to
//   /client; a staff persona calls the existing signInAs and goes to /staff. The panel closes.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '../test/harness';

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
afterEach(cleanup);

async function openPanel() {
  const view = await renderRoute('/staff', 'staff');
  const signInAsClient = vi.fn();
  Object.assign(view.demo, {
    listPersonas: () => (view.handle.admin as unknown as { listPersonas(): Promise<unknown[]> }).listPersonas(),
    signInAsClient,
  });
  await screen.findByTestId('demo-badge');
  fireEvent.keyDown(document.body, { key: 'P', code: 'KeyP', shiftKey: true, altKey: true });
  const panel = screen.getByRole('dialog', { name: 'Presenter panel' });
  return { ...view, panel, signInAsClient };
}

describe('Presenter panel: Jump to persona', () => {
  it('lists client admins and staff from the three nursery clients', async () => {
    const { panel } = await openPanel();
    const group = await within(panel).findByRole('group', { name: 'Jump to persona' });
    for (const name of [
      /Priya/,
      /Daniel/,
      /Fiona/,
      /Tariq/,
      /Colin/,
      /Rosa/,
      /Gemma/,
      /Jade/,
      /Mark/,
      /Maureen/,
      /Oscar/,
      /Toby/,
    ]) {
      expect(within(group).getAllByRole('button', { name }).length, String(name)).toBeGreaterThan(0);
    }
  });

  it('choosing a client admin from another client saves the client persona and opens the client app', async () => {
    const { panel, signInAsClient, router, keys } = await openPanel();
    const group = await within(panel).findByRole('group', { name: 'Jump to persona' });
    await userEvent.click(within(group).getByRole('button', { name: /Fiona/ }));
    expect(signInAsClient).toHaveBeenCalledTimes(1);
    const userId = signInAsClient.mock.calls[0]![0] as string;
    expect(userId).not.toBe(keys.users['priya']);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/client');
    });
    expect(document.querySelector('dialog[open]')).toBeNull();
  });

  it('choosing a staff persona uses signInAs and opens the staff app', async () => {
    const { panel, demo, router } = await openPanel();
    const group = await within(panel).findByRole('group', { name: 'Jump to persona' });
    await userEvent.click(within(group).getByRole('button', { name: /Oscar/ }));
    expect(demo.signInAs).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/staff');
    });
  });
});
