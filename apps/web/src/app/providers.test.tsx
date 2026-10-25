// Chunk 11 (F-5): providers and hooks. Contract: ./hooks exports useActor, useT, useCurrentUser, useAppDate;
// ./providers exports AppProviders and DemoContext-backed useDemo (from ./hooks).
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { fixedClock, offsetClock } from '@sta/domain';
import { productName } from '@sta/content';
import { AppProviders } from './providers';
import { useActor, useAppDate, useCurrentUser, useT } from './hooks';
import { actorFor, makeDemo, seededStore, t, TODAY } from '../test/harness';

afterEach(cleanup);

function Probe() {
  const actor = useActor();
  const tt = useT();
  const user = useCurrentUser();
  const date = useAppDate();
  return (
    <ul>
      <li data-testid="side">{actor.side}</li>
      <li data-testid="user">{user.data?.displayName ?? 'loading'}</li>
      <li data-testid="date">{date.toISOString()}</li>
      <li data-testid="t">{tt('demo.version', { version: '9.9.9' })}</li>
    </ul>
  );
}

describe('AppProviders', () => {
  it('gives hooks the actor, the loaded user, the clock date and t()', async () => {
    const { handle, keys } = await seededStore();
    render(
      <AppProviders
        store={handle.store}
        clock={fixedClock(TODAY)}
        actor={actorFor('client', keys)}
        demo={makeDemo('client', keys)}
      >
        <Probe />
      </AppProviders>,
    );
    expect(screen.getByTestId('side').textContent).toBe('client');
    expect(await screen.findByText('Priya Shah')).toBeTruthy();
    expect(screen.getByTestId('date').textContent).toBe(TODAY);
    expect(screen.getByTestId('t').textContent).toBe(t('demo.version', { version: '9.9.9' }));
    expect(screen.getByTestId('t').textContent).toContain('9.9.9');
  });

  it('useAppDate follows an offset clock', async () => {
    const { handle, keys } = await seededStore();
    const clock = offsetClock(fixedClock(TODAY), 30 * 24 * 3_600_000);
    render(
      <AppProviders store={handle.store} clock={clock} actor={actorFor('staff', keys)} demo={makeDemo('staff', keys)}>
        <Probe />
      </AppProviders>,
    );
    expect(screen.getByTestId('date').textContent).toBe('2026-11-18T09:00:00.000Z');
  });

  it('shows the product name from config', () => {
    expect(productName).toBe('[Product name]');
  });
});
