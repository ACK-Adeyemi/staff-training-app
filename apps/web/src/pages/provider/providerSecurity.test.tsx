// M4 chunk 15b: P19 "Security" at /provider/security (BP-8, brief 22.6). Written before the implementation
// (component `Security` in ./ProviderSecurity.tsx). Sessions and trusted devices are simulated and device-local.
//
// UI CONTRACT
//   Data (exists): store.twoFactor.status(actor). No new data ops. No permission gate (everyone sees their own).
//   Proposed language keys (en-GB):
//     provider.security.heading "Security"   .demoOnly "Demo only"
//     provider.security.policy "Two-step sign-in is required for all provider team members, with a few days grace to set it up."
//     provider.security.yourStatus "Your two-step sign-in"   .status.enrolled "On"
//     provider.security.sessions "Sessions"   .thisDevice "This device"   .signOutAll "Sign out everywhere"
//     provider.security.signedOut "Signed out everywhere on this demo."
//     provider.security.trust "Trust this device for 30 days"
//   h1 "Security". Text "Demo only" visible. Policy text above is on the page. Region "Your two-step sign-in" shows
//   "On" for an enrolled actor. Region "Sessions": one data-testid="session-row" containing "This device", button
//   "Sign out everywhere" (click shows role="status" with the signed-out text). Switch (role="switch") named
//   "Trust this device for 30 days", aria-checked "false" by default, toggles on click.
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { renderRoute } from '../../test/harness';

afterEach(cleanup);

const openP19 = async () => {
  await renderRoute('/provider/security', 'provider');
  await screen.findByRole('heading', { level: 1, name: 'Security' });
};

describe('P19 Security', () => {
  it('marks the page as demo only and states the provider-wide policy', async () => {
    await openP19();
    expect(screen.getByText('Demo only')).toBeTruthy();
    expect(
      screen.getByText(
        'Two-step sign-in is required for all provider team members, with a few days grace to set it up.',
      ),
    ).toBeTruthy();
  });

  it("shows the actor's own two-step status as On when enrolled", async () => {
    await openP19();
    const region = screen.getByRole('region', { name: 'Your two-step sign-in' });
    expect(within(region).getByText('On')).toBeTruthy();
  });

  it('lists this device as the only session and signs out everywhere with a plain confirmation', async () => {
    await openP19();
    const region = screen.getByRole('region', { name: 'Sessions' });
    const rows = within(region).getAllByTestId('session-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain('This device');
    await userEvent.click(within(region).getByRole('button', { name: 'Sign out everywhere' }));
    expect((await screen.findByRole('status')).textContent).toContain('Signed out everywhere on this demo.');
  });

  it('has a Trust this device for 30 days switch that is off by default and can be turned on and off', async () => {
    await openP19();
    const sw = screen.getByRole('switch', { name: 'Trust this device for 30 days' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    await userEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    await userEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });
});
