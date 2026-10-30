// M4 chunk 15b: P23 "Provider sign in" at /provider/signin (BP-8, brief 22.6). Written before the implementation
// (component `ProviderSignIn` in ./ProviderSignIn.tsx). Mirrors C26 (../client/SignIn.tsx) and goes to /provider.
//
// UI CONTRACT
//   Data (exists): store.twoFactor.status / verify / useRecoveryCode / startEnrolment / confirmEnrolment.
//   Proposed language keys (en-GB):
//     provider.signin.title "Provider sign in"   .demoOnly "Demo only: any email and password work."
//     provider.signin.email "Email"  .password "Password"  .submit "Sign in"
//     provider.signin.intro "Enter the code from your authenticator app."
//     provider.signin.code "Sign-in code"  .confirm "Confirm"
//     provider.signin.useRecovery "Use a recovery code"  .useAppCode "Use the app code"  .recoveryLabel "Recovery code"
//     provider.signin.wrong "That code is not right. Try again."  .locked "Too many tries. Wait a little and try again."
//   Step 1: h1 + "Demo only" note, textboxes by label "Email" and "Password", button "Sign in". For an enrolled
//   actor step 2 asks for "Sign-in code" (CodeInput) and button "Confirm"; the demo code 123456 navigates to /provider.
//   A wrong code or recovery code shows role="alert" with the wrong text and stays on /provider/signin.
//   Button "Use a recovery code" swaps to a textbox "Recovery code"; a valid unused code navigates to /provider.
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { actorFor, renderRoute } from '../../test/harness';

afterEach(cleanup);

const signInStep = async (opts?: Parameters<typeof renderRoute>[2]) => {
  const view = await renderRoute('/provider/signin', 'provider', opts);
  await screen.findByRole('heading', { level: 1, name: 'Provider sign in' });
  expect(screen.getByText(/demo only/i)).toBeTruthy();
  await userEvent.type(screen.getByLabelText('Email'), 'someone@example.test');
  await userEvent.type(screen.getByLabelText('Password'), 'anything at all');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  return view;
};
const enterCode = async (code: string) => {
  const input = await screen.findByLabelText('Sign-in code');
  await userEvent.clear(input);
  await userEvent.type(input, code);
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
};

describe('P23 Provider sign in and two-step sign-in', () => {
  it('asks an enrolled team member for a code and accepts the demo code, going to the provider area', async () => {
    const { router } = await signInStep();
    await enterCode('123456');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/provider');
    });
  });

  it('refuses a wrong code with a plain message in an alert and stays on the page', async () => {
    const { router } = await signInStep();
    await enterCode('654321');
    expect((await screen.findByRole('alert')).textContent).toContain('That code is not right. Try again.');
    expect(router.state.location.pathname).toBe('/provider/signin');
  });

  it('refuses a wrong recovery code with the same plain message', async () => {
    const { router } = await signInStep();
    await userEvent.click(await screen.findByRole('button', { name: 'Use a recovery code' }));
    await userEvent.type(await screen.findByLabelText('Recovery code'), 'not-a-real-code');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect((await screen.findByRole('alert')).textContent).toContain('That code is not right. Try again.');
    expect(router.state.location.pathname).toBe('/provider/signin');
  });

  it('accepts a real recovery code instead of the app code', async () => {
    let code = '';
    const tom = (keys: Parameters<typeof actorFor>[1]) => ({
      ...actorFor('provider', keys),
      userId: keys.users['tom'],
    });
    const { router } = await signInStep({
      actor: tom,
      prepare: async ({ handle, keys }) => {
        const ctx = { ...tom(keys) };
        await handle.store.twoFactor.startEnrolment(ctx);
        code = (await handle.store.twoFactor.confirmEnrolment(ctx, '123456')).recoveryCodes[0]!;
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Use a recovery code' }));
    await userEvent.type(await screen.findByLabelText('Recovery code'), code);
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/provider');
    });
  });

  it('can switch from the recovery code back to the app code', async () => {
    await signInStep();
    await userEvent.click(await screen.findByRole('button', { name: 'Use a recovery code' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Use the app code' }));
    expect(await screen.findByLabelText('Sign-in code')).toBeTruthy();
  });
});
