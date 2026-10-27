// M3 chunk 13 (BP-8, BP-9, BP-10 team part, BP-12, F-2): C18 Team and roles, C21 Account status, C24 Settings,
// C25 Onboarding and C26 Sign in. Written before the implementation.
// Contract the implementer must provide (each route renders exactly one h1, inside the client shell except C26):
//   C26 /client/signin   h1 t('twoFactor.title'). Step 1 "Email" and "Password" fields, a "Demo only" note and a "Sign in"
//        button (any password). Enrolled admins then see the code step (label t('twoFactor.code'), button
//        t('twoFactor.confirm'), link/button t('twoFactor.useRecovery')); 123456 goes to /client, a wrong code shows
//        role=alert t('twoFactor.wrong'), five wrong codes show t('twoFactor.locked'). Admins who are not enrolled see
//        "Start set-up" (t('twoFactor.start')), then an svg role=img QR code plus the manual key text
//        t('twoFactor.secret'), the code field, and after 123456 a region named t('twoFactor.recovery.title') with ten
//        listitems and a button t('twoFactor.recovery.saved') that goes to /client. A "Can't access your account?" button
//        reveals help text (role=status or a region) that mentions the Account Owner.
//   C21 /client/account-status   h1 matches /account/i. A list data-testid="account-timeline" with one listitem per state
//        (t('account.state.*') for active, pastDue, limited, readOnly, closed), the current one with aria-current="step".
//        A "What works now" region (t('account.whatWorks')) with one listitem per whatWorks entry showing t(entry.key).
//        Next change text with the date. "Fix this now" (t('account.fixNow')) only for billing.manage holders.
//        Amounts (£) only for billing.view holders.
//   C18 /client/team   h1 t('team.title'). Region t('team.members') with one listitem per admin showing name, role name,
//        scope, and data-testid="team-2fa-<userId>" with t('twoFactor.enrolled') or t('twoFactor.daysLeft'). Without
//        team.manageRoles there is no invite form and no role editing. With it: form with t('team.email'), a combobox
//        t('team.role'), a button t('team.invite'), success t('team.invited'). A button named "What can <name> do?" opens a
//        panel whose rows are data-testid="can-do-<permissionId>" with data-allowed="true"|"false" matching can().
//        A button "Preview as this role" shows data-testid="role-preview". Custom roles: textbox t('team.roleName'),
//        combobox "Start from", button t('team.saveRole'); saved roles are listed in a region t('team.roles').
//        Region t('team.activity') lists the activity log. The Account Owner has no enabled remove button and
//        t('team.ownerNote') is visible.
//   C24 /client/settings   h1 t('org.settings.title'). Without settings.view: role=alert t('errors.forbidden'). With it:
//        Display name (t('org.displayName')), Short name, a region data-testid="staff-preview" that follows the typed
//        name, Save (t('org.save')) with success t('org.saved'), a region "Name history" listing former names, checkboxes
//        t('org.settings.staffTickets') and t('org.settings.pulse'), number fields "Amber window (days)", "Weekly goal
//        (lessons)" and "First aider threshold", a "Save settings" button with success t('org.settings.saved'), and a
//        region t('org.sites.title') with a text field t('org.sites.name') and a select t('org.sites.region') per site
//        and a button t('org.sites.rename').
//   C25 /client/onboarding   h1 t('onboarding.title'). Text t('onboarding.progress') "{done} of {total} done". One listitem
//        per step with data-testid="onboarding-step-<key>" (keys inviteStaff, reminderSettings, assignTraining,
//        setUpCompetition, exportMatrix) and data-done="true"|"false". Steps tick themselves when the store changes. All
//        done shows t('onboarding.done'). "Hide this list" (t('onboarding.dismiss')) shows t('onboarding.hidden').
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ActorContext, StoreHandle } from '@sta/data';
import type { Client, Site } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute, t, TODAY } from '../../test/harness';

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
});
afterEach(cleanup);

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.parse(TODAY) + days * DAY).toISOString();
const need = <T,>(v: T | undefined): T => {
  if (v === undefined) throw new Error('missing');
  return v;
};
const clientActor =
  (userKey: string, clientKey: string) =>
  (keys: SeedKeys): ActorContext => ({
    userId: need(keys.users[userKey]),
    side: 'client',
    clientId: need(keys.clients[clientKey]),
    now: TODAY,
  });
const daniel = clientActor('daniel', 'littleAcorns');
const failPayment = async ({ handle, keys }: { handle: StoreHandle; keys: SeedKeys }) => {
  await handle.admin.simulateFailedPayment(need(keys.clients['littleAcorns']), TODAY);
};
// Daniel's two-step grace ends before day 8, which would send him to sign-in; enrol him so the account screens open
// (see docs/decisions.md, M3 chunk 13).
const failPaymentEnrolled = async (ctx: { handle: StoreHandle; keys: SeedKeys }) => {
  await failPayment(ctx);
  await ctx.handle.store.twoFactor.confirmEnrolment(daniel(ctx.keys), '123456');
};
const dump = async <R,>(handle: StoreHandle, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as unknown as Record<string, unknown[]>)[store] as R[];

describe('C26 Sign in and two-step sign-in', () => {
  async function signInStep(path = '/client/signin', actor?: (k: SeedKeys) => ActorContext) {
    const view = await renderRoute(path, 'client', actor ? { actor } : {});
    await screen.findByRole('heading', { level: 1, name: t('twoFactor.title') });
    expect(screen.getByText(/demo only/i)).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Email'), 'someone@example.test');
    await userEvent.type(screen.getByLabelText('Password'), 'anything at all');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    return view;
  }

  it('asks an enrolled admin for a code and accepts 123456', async () => {
    const { router } = await signInStep();
    await userEvent.type(await screen.findByLabelText(t('twoFactor.code')), '123456');
    await userEvent.click(screen.getByRole('button', { name: t('twoFactor.confirm') }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/client');
    });
  });

  it('refuses a wrong code with a plain message and stays on the page', async () => {
    const { router } = await signInStep();
    await userEvent.type(await screen.findByLabelText(t('twoFactor.code')), '654321');
    await userEvent.click(screen.getByRole('button', { name: t('twoFactor.confirm') }));
    expect((await screen.findByRole('alert')).textContent).toContain(t('twoFactor.wrong'));
    expect(router.state.location.pathname).toBe('/client/signin');
  });

  it('locks code entry after five wrong codes', async () => {
    await signInStep();
    for (let i = 0; i < 5; i++) {
      const input = await screen.findByLabelText(t('twoFactor.code'));
      await userEvent.clear(input);
      await userEvent.type(input, '000000');
      await userEvent.click(screen.getByRole('button', { name: t('twoFactor.confirm') }));
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeTruthy();
      });
    }
    expect((await screen.findByRole('alert')).textContent).toContain(t('twoFactor.locked'));
  });

  it('offers a recovery code instead of the app code', async () => {
    await signInStep();
    await userEvent.click(await screen.findByRole('button', { name: t('twoFactor.useRecovery') }));
    expect(await screen.findByLabelText(/recovery code/i)).toBeTruthy();
  });

  it('enrols an admin who is not set up: QR code, manual key, code, ten recovery codes shown once, then in', async () => {
    const { router, handle, keys } = await signInStep('/client/signin', daniel);
    await userEvent.click(await screen.findByRole('button', { name: t('twoFactor.start') }));
    expect(await screen.findByRole('img', { name: /./ })).toBeTruthy();
    expect(screen.getByText(/Or type this key: \S+/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText(t('twoFactor.code')), '111111');
    await userEvent.click(screen.getByRole('button', { name: t('twoFactor.confirm') }));
    expect((await screen.findByRole('alert')).textContent).toContain(t('twoFactor.wrong'));
    const input = screen.getByLabelText(t('twoFactor.code'));
    await userEvent.clear(input);
    await userEvent.type(input, '123456');
    await userEvent.click(screen.getByRole('button', { name: t('twoFactor.confirm') }));
    const codes = await screen.findByRole('region', { name: t('twoFactor.recovery.title') });
    const shown = within(codes)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(new Set(shown).size).toBe(10);
    // Stored only as hashes: the plain codes are in no record.
    const stored = JSON.stringify(await dump(handle, 'users'));
    for (const code of shown) expect(stored).not.toContain(code);
    expect(await handle.store.twoFactor.status(daniel(keys))).toEqual({ kind: 'enrolled' });
    await userEvent.click(screen.getByRole('button', { name: t('twoFactor.recovery.saved') }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/client');
    });
  });

  it("shows help under Can't access your account? that points to the Account Owner", async () => {
    await renderRoute('/client/signin', 'client');
    await screen.findByRole('heading', { level: 1, name: t('twoFactor.title') });
    await userEvent.click(screen.getByRole('button', { name: /can't access your account/i }));
    expect(await screen.findByText(/account owner/i)).toBeTruthy();
  });
});

describe('C21 Account status', () => {
  it('shows an active account with the whole timeline and everything working', async () => {
    const { keys, handle } = await renderRoute('/client/account-status', 'client');
    await screen.findByRole('heading', { level: 1, name: /account/i });
    const timeline = await screen.findByTestId('account-timeline');
    const states = within(timeline)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    for (const key of ['active', 'pastDue', 'limited', 'readOnly', 'closed'] as const) {
      expect(
        states.some((s) => s.includes(t(`account.state.${key}`))),
        key,
      ).toBe(true);
    }
    const current = timeline.querySelectorAll('[aria-current="step"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toContain(t('account.state.active'));
    const status = await handle.store.account.status(actorFor('client', keys));
    const works = screen.getByRole('region', { name: t('account.whatWorks') });
    expect(within(works).getAllByRole('listitem')).toHaveLength(status.whatWorks.length);
  });

  it.each([
    [8, 'pastDue'],
    [16, 'limited'],
    [32, 'readOnly'],
  ] as const)(
    'on day %i of non-payment marks %s as current and lists what works from the data layer',
    async (days, state) => {
      const { keys, handle } = await renderRoute('/client/account-status', 'client', {
        prepare: failPayment,
        now: at(days),
      });
      const timeline = await screen.findByTestId('account-timeline');
      const current = timeline.querySelector('[aria-current="step"]');
      expect(current?.textContent).toContain(t(`account.state.${state}`));
      const status = await handle.store.account.status({ ...actorFor('client', keys), now: at(days) });
      expect(status.state).toBe(state);
      const works = screen.getByRole('region', { name: t('account.whatWorks') });
      for (const entry of status.whatWorks) {
        expect(works.textContent, entry.key).toContain(t(entry.key as never));
      }
      // Exports keep working in every state (BP-12).
      expect(works.textContent).toContain(t('account.works.exports.yes'));
      if (status.nextChange) expect(screen.getByText(/next change/i)).toBeTruthy();
    },
  );

  it('shows Priya the amount and Fix this now, and Daniel neither', async () => {
    const priyaView = await renderRoute('/client/account-status', 'client', { prepare: failPayment, now: at(8) });
    await screen.findByTestId('account-timeline');
    expect(screen.getByRole('button', { name: t('account.fixNow') })).toBeTruthy();
    expect(document.body.textContent).toMatch(/£\d/);
    priyaView.unmount();
    await renderRoute('/client/account-status', 'client', { actor: daniel, prepare: failPaymentEnrolled, now: at(8) });
    await screen.findByTestId('account-timeline');
    expect(screen.queryByRole('button', { name: t('account.fixNow') })).toBeNull();
    expect(screen.queryByRole('link', { name: t('account.fixNow') })).toBeNull();
    expect(document.body.textContent).not.toMatch(/£\d/);
  });
});

describe('C18 Team and roles', () => {
  const memberRow = async (name: string) => {
    const region = await screen.findByRole('region', { name: t('team.members') });
    const row = within(region)
      .getAllByRole('listitem')
      .find((li) => li.textContent.includes(name));
    return need(row);
  };

  it('lists the admins with role, scope and two-step status', async () => {
    const { keys } = await renderRoute('/client/team', 'client');
    await screen.findByRole('heading', { level: 1, name: t('team.title') });
    const priyaRow = await memberRow('Priya Shah');
    expect(priyaRow.textContent).toContain('Account Owner');
    expect(within(priyaRow).getByTestId(`team-2fa-${need(keys.users['priya'])}`).textContent).toContain(
      t('twoFactor.enrolled'),
    );
    const danielRow = await memberRow('Daniel Hughes');
    expect(danielRow.textContent).toContain('Supervisor');
    expect(within(danielRow).getByTestId(`team-2fa-${need(keys.users['daniel'])}`).textContent).toContain(
      t('twoFactor.daysLeft', { days: 5 }),
    );
  });

  it('does not let Daniel invite or change roles, though he can see the list', async () => {
    await renderRoute('/client/team', 'client', { actor: daniel });
    await memberRow('Priya Shah');
    expect(screen.queryByRole('button', { name: t('team.invite') })).toBeNull();
    expect(screen.queryByRole('button', { name: t('team.saveRole') })).toBeNull();
  });

  it('invites an admin, then lists them and logs the change', async () => {
    const { handle, keys } = await renderRoute('/client/team', 'client');
    await memberRow('Priya Shah');
    await userEvent.type(screen.getByLabelText(t('team.email')), 'new.supervisor@littleacornsnursery.test');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: t('team.role') }), 'Supervisor');
    await userEvent.click(screen.getByRole('button', { name: t('team.invite') }));
    expect(await screen.findByText(t('team.invited'))).toBeTruthy();
    const members = await handle.store.team.members(actorFor('client', keys));
    expect(members.some((m) => m.email === 'new.supervisor@littleacornsnursery.test')).toBe(true);
    const log = screen.getByRole('region', { name: t('team.activity') });
    await waitFor(() => {
      expect(within(log).queryByText(t('team.activityEmpty'))).toBeNull();
      expect(within(log).getAllByRole('listitem').length).toBeGreaterThan(0);
    });
  });

  it('shows a plain message when an invite is invalid', async () => {
    await renderRoute('/client/team', 'client');
    await memberRow('Priya Shah');
    await userEvent.type(screen.getByLabelText(t('team.email')), 'not an email');
    await userEvent.click(screen.getByRole('button', { name: t('team.invite') }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toMatch(/ValidationError|Error:/);
  });

  it('What can this person do? agrees with can() for Daniel', async () => {
    const { handle, keys } = await renderRoute('/client/team', 'client');
    const row = await memberRow('Daniel Hughes');
    await userEvent.click(within(row).getByRole('button', { name: /what can .*daniel.* do/i }));
    const perms = await handle.store.access.permissions(daniel(keys));
    for (const id of ['billing.view', 'team.manageRoles', 'assign.manage', 'evidence.approve', 'settings.manage']) {
      const el = await screen.findByTestId(`can-do-${id}`);
      expect(el.getAttribute('data-allowed'), id).toBe(String(perms.some((p) => p.permissionId === id)));
    }
    expect(screen.getByTestId('can-do-billing.view').getAttribute('data-allowed')).toBe('false');
    expect(screen.getByTestId('can-do-assign.manage').getAttribute('data-allowed')).toBe('true');
  });

  it('previews the app as a role', async () => {
    await renderRoute('/client/team', 'client');
    await memberRow('Priya Shah');
    await userEvent.click(screen.getAllByRole('button', { name: /preview as this role/i })[0]!);
    expect(await screen.findByTestId('role-preview')).toBeTruthy();
  });

  it('creates a custom role from a template', async () => {
    const { handle } = await renderRoute('/client/team', 'client');
    await memberRow('Priya Shah');
    await userEvent.type(screen.getByRole('textbox', { name: t('team.roleName') }), 'Rota helper');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /start from/i }), 'Supervisor');
    await userEvent.click(screen.getByRole('button', { name: t('team.saveRole') }));
    const roles = await screen.findByRole('region', { name: t('team.roles') });
    await waitFor(() => {
      expect(roles.textContent).toContain('Rota helper');
    });
    const stored = await dump<{ name: string }>(handle, 'roles');
    expect(stored.some((r) => r.name === 'Rota helper')).toBe(true);
  });

  it('keeps the Account Owner: no enabled remove button and a note', async () => {
    await renderRoute('/client/team', 'client');
    const row = await memberRow('Priya Shah');
    const remove = within(row).queryByRole('button', { name: new RegExp(t('team.revoke')) });
    if (remove) expect((remove as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(t('team.ownerNote'))).toBeTruthy();
  });
});

describe('C24 Settings', () => {
  it('tells Daniel he has no access, never an empty page', async () => {
    await renderRoute('/client/settings', 'client', { actor: daniel });
    expect((await screen.findByRole('alert')).textContent).toContain(t('errors.forbidden'));
  });

  it('changes the display name, shows the staff preview as you type, and records the old name', async () => {
    const { handle, keys } = await renderRoute('/client/settings', 'client');
    await screen.findByRole('heading', { level: 1, name: t('org.settings.title') });
    const name = await screen.findByLabelText(t('org.displayName'));
    expect((name as HTMLInputElement).value).toBe('Little Acorns Nursery');
    await userEvent.clear(name);
    await userEvent.type(name, 'Little Acorns Early Years');
    expect(screen.getByTestId('staff-preview').textContent).toContain('Little Acorns Early Years');
    await userEvent.click(screen.getByRole('button', { name: t('org.save') }));
    expect(await screen.findByText(t('org.saved'))).toBeTruthy();
    expect(await handle.store.organisation.profile(actorFor('client', keys))).toMatchObject({
      displayName: 'Little Acorns Early Years',
    });
    expect(screen.getByRole('region', { name: /name history/i }).textContent).toContain('Little Acorns Nursery');
  });

  it('does not save an empty display name', async () => {
    const { handle, keys } = await renderRoute('/client/settings', 'client');
    const name = await screen.findByLabelText(t('org.displayName'));
    await userEvent.clear(name);
    await userEvent.click(screen.getByRole('button', { name: t('org.save') }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(await handle.store.organisation.profile(actorFor('client', keys))).toMatchObject({
      displayName: 'Little Acorns Nursery',
    });
  });

  it('saves allowlisted settings: amber window, staff tickets', async () => {
    const { handle, keys } = await renderRoute('/client/settings', 'client');
    const amber = await screen.findByLabelText(/amber window/i);
    await userEvent.clear(amber);
    await userEvent.type(amber, '45');
    await userEvent.click(screen.getByRole('checkbox', { name: t('org.settings.staffTickets') }));
    await userEvent.click(screen.getByRole('button', { name: /save settings/i }));
    expect(await screen.findByText(t('org.settings.saved'))).toBeTruthy();
    const client = (await dump<Client>(handle, 'clients')).find((c) => c.id === keys.clients['littleAcorns']);
    expect(client?.settings.amberWindowDays).toBe(45);
    expect(client?.settings.allowStaffTickets).toBe(false);
  });

  it('refuses an out-of-range amber window with a message and saves nothing', async () => {
    const { handle, keys } = await renderRoute('/client/settings', 'client');
    const amber = await screen.findByLabelText(/amber window/i);
    await userEvent.clear(amber);
    await userEvent.type(amber, '0');
    await userEvent.click(screen.getByRole('button', { name: /save settings/i }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    const client = (await dump<Client>(handle, 'clients')).find((c) => c.id === keys.clients['littleAcorns']);
    expect(client?.settings.amberWindowDays).toBe(60);
  });

  it('renames a site and gives it a region', async () => {
    const { handle, keys } = await renderRoute('/client/settings', 'client');
    const sites = await screen.findByRole('region', { name: t('org.sites.title') });
    const name = within(sites).getByRole('textbox', { name: t('org.sites.name') });
    await userEvent.clear(name);
    await userEvent.type(name, 'Little Acorns Main');
    await userEvent.selectOptions(within(sites).getByRole('combobox', { name: t('org.sites.region') }), 'South West');
    await userEvent.click(within(sites).getByRole('button', { name: t('org.sites.rename') }));
    await waitFor(async () => {
      const site = (await dump<Site>(handle, 'sites')).find((s) => s.clientId === keys.clients['littleAcorns']);
      expect(site?.name).toBe('Little Acorns Main');
      expect(site?.region).toBe('South West');
    });
  });
});

describe('C25 Onboarding', () => {
  it('shows the checklist with the steps already done ticked, in words', async () => {
    await renderRoute('/client/onboarding', 'client');
    await screen.findByRole('heading', { level: 1, name: t('onboarding.title') });
    expect(await screen.findByText(t('onboarding.progress', { done: 4, total: 5 }))).toBeTruthy();
    for (const key of ['inviteStaff', 'reminderSettings', 'assignTraining', 'exportMatrix']) {
      expect(screen.getByTestId(`onboarding-step-${key}`).getAttribute('data-done'), key).toBe('true');
    }
    const open = screen.getByTestId('onboarding-step-setUpCompetition');
    expect(open.getAttribute('data-done')).toBe('false');
    // Not colour alone: a done step says so in text.
    expect(screen.getByTestId('onboarding-step-inviteStaff').textContent).toMatch(/done/i);
  });

  it('ticks a step off by itself when the work happens, with no reload', async () => {
    const { handle, keys } = await renderRoute('/client/onboarding', 'client');
    await screen.findByText(t('onboarding.progress', { done: 4, total: 5 }));
    await handle.store.onboarding.markDone(actorFor('client', keys), 'setUpCompetition');
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-step-setUpCompetition').getAttribute('data-done')).toBe('true');
    });
    expect(screen.getByText(t('onboarding.progress', { done: 5, total: 5 }))).toBeTruthy();
    expect(screen.getByText(t('onboarding.done'))).toBeTruthy();
  });

  it('hides the list when asked and says where to find it again', async () => {
    await renderRoute('/client/onboarding', 'client');
    await userEvent.click(await screen.findByRole('button', { name: t('onboarding.dismiss') }));
    expect(await screen.findByText(t('onboarding.hidden'))).toBeTruthy();
  });
});
