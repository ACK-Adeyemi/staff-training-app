// Chunk 11: the route error boundary. Contract: ./RouteError exports RouteError (a react-router errorElement) and
// the lang file gains errors.forbidden, errors.accountState, errors.validation, errors.unknown, errors.storage.
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountStateError, ForbiddenError, NotFoundError, ValidationError } from '@sta/data';
import { fixedClock } from '@sta/domain';
import { AppProviders } from './providers';
import { RouteError } from './RouteError';
import { actorFor, makeDemo, seededStore, t, TODAY } from '../test/harness';

afterEach(cleanup);

async function renderThrowing(error: unknown) {
  const { handle, keys } = await seededStore();
  const Boom = () => {
    throw error;
  };
  const router = createMemoryRouter([{ path: '/', element: <Boom />, errorElement: <RouteError /> }]);
  const demo = makeDemo('staff', keys);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  render(
    <AppProviders store={handle.store} clock={fixedClock(TODAY)} actor={actorFor('staff', keys)} demo={demo}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return demo;
}

describe('route error boundary', () => {
  it('shows the forbidden message for a ForbiddenError', async () => {
    await renderThrowing(new ForbiddenError('permission'));
    expect(await screen.findByText("You don't have access to this. Ask your manager.")).toBeTruthy();
  });

  it.each([
    [new NotFoundError(), 'errors.notFound'],
    [new AccountStateError('readOnly', 'evidence.upload'), 'errors.accountState'],
    [new ValidationError(['bad']), 'errors.validation'],
    [new Error('kaboom'), 'errors.unknown'],
  ] as const)('maps %s to its language key', async (error, key) => {
    await renderThrowing(error);
    expect(await screen.findByText(t(key))).toBeTruthy();
  });

  it('never leaks the raw error message', async () => {
    await renderThrowing(new Error('secret-stack-detail'));
    await screen.findByRole('alert');
    expect(screen.queryByText(/secret-stack-detail/)).toBeNull();
  });

  it('shows the storage message for a quota or unavailable-storage failure', async () => {
    await renderThrowing(new DOMException('full', 'QuotaExceededError'));
    expect(await screen.findByText(t('errors.storage'))).toBeTruthy();
  });

  it('offers Reset demo, which calls the demo action', async () => {
    const demo = await renderThrowing(new Error('x'));
    await userEvent.click(await screen.findByRole('button', { name: t('demo.reset') }));
    expect(demo.reset).toHaveBeenCalledTimes(1);
  });
});
