// M4 chunk 10 (BP-3, U layer): P4 New client wizard at #/provider/clients/new. Written before the implementation.
//
// UI CONTRACT (data: store.providerOps.createClient; gate clients.write via can()/holdsAnywhere, never role names):
//   Proposed language keys (en-GB):
//     provider.newClient.title "New client"  .name "Organisation name"  .pack "Industry pack"
//     .stubFlag "(preview only)"  .package "Package"  .billing "Trial or paid"  .trial "Trial"  .paid "Paid"
//     .trialDays "Trial length in days"  .billingContact "Billing contact"  .site "Site name"  .addSite "Add site"
//     .adminName "First admin name"  .adminEmail "First admin email"  .adminRole "Account Owner"
//     .twoFactor "They must set up two-step sign-in before they can use the account."  .submit "Create client"
//     .error.name / .error.site / .error.email (shown as role="alert" text, field linked by aria-describedby)
//     .created "Client created"  .viewClient "Open client"  .invitationSent "Invitation email"
//     provider.noPermission (existing) "You don't have permission ..." ; provider.clients.new "New client"
//   Form controls are found by label: textbox "Organisation name", combobox "Industry pack" (option values are pack
//   ids, nursery then luxury retail first, stub packs after, text containing "preview only"), combobox "Package"
//   (option values are packageIds), radios "Trial" and "Paid", spinbutton "Trial length in days" (only while Trial is
//   chosen), textbox "Billing contact", textboxes "Site name" (one per site; button "Add site" adds one),
//   textboxes "First admin name" and "First admin email". Submit button "Create client".
//   After success: data-testid="new-client-created" (names the client, contains a link to #/provider/clients/<id>) and
//   data-testid="new-client-outbox-entry" (read from demo.listOutbox; shows the recipient address and subject).
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { allPacks, nurseryPack, packageIds } from '@sta/content';
import type { Client, Site } from '@sta/domain';
import { actorFor, renderRoute } from '../../test/harness';

afterEach(cleanup);

const NEW = '/provider/clients/new';
const EMAIL = 'owner@bluebell.example.test';

async function clientsNamed(handle: { admin: { dumpAll(): Promise<unknown> } }, name: string) {
  const all = (await handle.admin.dumpAll()) as { clients: Client[]; sites: Site[] };
  const clients = all.clients.filter((c) => c.displayName === name);
  return { clients, sites: all.sites, total: all.clients.length };
}

async function fill(opts: { name?: string; site?: string; email?: string } = {}) {
  await userEvent.type(
    await screen.findByRole('textbox', { name: 'Organisation name' }),
    opts.name ?? 'Bluebell Test Nursery',
  );
  await userEvent.type(screen.getByRole('textbox', { name: 'Site name' }), opts.site ?? 'Bluebell Main');
  await userEvent.type(screen.getByRole('textbox', { name: 'First admin name' }), 'Bea Bluebell');
  await userEvent.type(screen.getByRole('textbox', { name: 'First admin email' }), opts.email ?? EMAIL);
}

describe('P4 New client form', () => {
  it('shows the heading and every field', async () => {
    await renderRoute(NEW, 'provider');
    expect(await screen.findByRole('heading', { level: 1, name: 'New client' })).toBeTruthy();
    for (const name of ['Organisation name', 'Billing contact', 'Site name', 'First admin name', 'First admin email']) {
      expect(screen.getByRole('textbox', { name })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Add site' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Package' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Trial' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Paid' })).toBeTruthy();
    expect(screen.getByText('Account Owner')).toBeTruthy();
    expect(screen.getByText(/two-step sign-in/i)).toBeTruthy();
  });

  it('lists nursery and luxury retail first and flags the stub packs', async () => {
    await renderRoute(NEW, 'provider');
    const select = await screen.findByRole('combobox', { name: 'Industry pack' });
    const options = within(select).getAllByRole<HTMLOptionElement>('option');
    expect(options.map((o) => o.value)).toEqual([
      nurseryPack.id,
      ...allPacks.filter((p) => p.id !== nurseryPack.id && p.status !== 'stub').map((p) => p.id),
      ...allPacks.filter((p) => p.status === 'stub').map((p) => p.id),
    ]);
    for (const o of options) {
      const stub = allPacks.find((p) => p.id === o.value)?.status === 'stub';
      expect(/preview only/i.test(o.textContent)).toBe(stub);
    }
  });

  it('offers every package and shows the trial length only for a trial', async () => {
    await renderRoute(NEW, 'provider');
    const pkg = await screen.findByRole('combobox', { name: 'Package' });
    expect(
      within(pkg)
        .getAllByRole('option')
        .map((o) => (o as HTMLOptionElement).value)
        .sort(),
    ).toEqual(Object.values(packageIds).sort());
    await userEvent.click(screen.getByRole('radio', { name: 'Trial' }));
    expect(screen.getByRole('spinbutton', { name: 'Trial length in days' })).toBeTruthy();
    await userEvent.click(screen.getByRole('radio', { name: 'Paid' }));
    expect(screen.queryByRole('spinbutton', { name: 'Trial length in days' })).toBeNull();
  });

  it('adds a second site field with Add site', async () => {
    await renderRoute(NEW, 'provider');
    await screen.findByRole('textbox', { name: 'Site name' });
    await userEvent.click(screen.getByRole('button', { name: 'Add site' }));
    expect(screen.getAllByRole('textbox', { name: 'Site name' })).toHaveLength(2);
  });
});

describe('P4 validation', () => {
  it('rejects a blank organisation name with an alert and creates nothing', async () => {
    const r = await renderRoute(NEW, 'provider');
    const before = (await clientsNamed(r.handle, '')).total;
    await fill({ name: ' ' });
    await userEvent.click(screen.getByRole('button', { name: 'Create client' }));
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(screen.getByRole('textbox', { name: 'Organisation name' }).getAttribute('aria-describedby')).toBeTruthy();
    expect((await clientsNamed(r.handle, '')).total).toBe(before);
    expect(screen.queryByTestId('new-client-created')).toBeNull();
  });

  it('rejects a blank site name with an alert and creates nothing', async () => {
    const r = await renderRoute(NEW, 'provider');
    const before = (await clientsNamed(r.handle, '')).total;
    await userEvent.type(await screen.findByRole('textbox', { name: 'Organisation name' }), 'Bluebell Test Nursery');
    await userEvent.type(screen.getByRole('textbox', { name: 'First admin name' }), 'Bea Bluebell');
    await userEvent.type(screen.getByRole('textbox', { name: 'First admin email' }), EMAIL);
    await userEvent.click(screen.getByRole('button', { name: 'Create client' }));
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(screen.getByRole('textbox', { name: 'Site name' }).getAttribute('aria-describedby')).toBeTruthy();
    expect((await clientsNamed(r.handle, '')).total).toBe(before);
  });

  it('rejects a bad admin email with an alert and creates nothing', async () => {
    const r = await renderRoute(NEW, 'provider');
    const before = (await clientsNamed(r.handle, '')).total;
    await fill({ email: 'not-an-email' });
    await userEvent.click(screen.getByRole('button', { name: 'Create client' }));
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(screen.getByRole('textbox', { name: 'First admin email' }).getAttribute('aria-describedby')).toBeTruthy();
    expect((await clientsNamed(r.handle, '')).total).toBe(before);
  });
});

describe('P4 happy path', () => {
  it('creates the client and shows the confirmation and the Outbox invitation', async () => {
    const r = await renderRoute(NEW, 'provider');
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Add site' }));
    await userEvent.type(screen.getAllByRole('textbox', { name: 'Site name' })[1] as HTMLElement, 'Bluebell Annexe');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Package' }), packageIds.standard);
    await userEvent.click(screen.getByRole('button', { name: 'Create client' }));

    const done = await screen.findByTestId('new-client-created');
    const { clients, sites } = await clientsNamed(r.handle, 'Bluebell Test Nursery');
    expect(clients).toHaveLength(1);
    const client = clients[0] as Client;
    expect(client.industryPackId).toBe(nurseryPack.id);
    expect(
      sites
        .filter((s) => s.clientId === client.id)
        .map((s) => s.name)
        .sort(),
    ).toEqual(['Bluebell Annexe', 'Bluebell Main']);
    const subs = (
      (await r.handle.admin.dumpAll()) as unknown as { subscriptions: { clientId: string; packageId: string }[] }
    ).subscriptions;
    expect(subs.find((s) => s.clientId === client.id)?.packageId).toBe(packageIds.standard);

    expect(done.textContent).toContain('Bluebell Test Nursery');
    const link = within(done).getByRole('link');
    expect(link.getAttribute('href')).toBe(`#/provider/clients/${client.id}`);
    await waitFor(() => {
      expect(screen.getByTestId('new-client-outbox-entry').textContent).toContain(EMAIL);
    });
    const sent = (await r.handle.admin.listOutbox()).filter((m) => m.to === EMAIL);
    expect(sent).toHaveLength(1);
  });
});

describe('P4 gating', () => {
  it('shows no form to a provider user without clients.write', async () => {
    await renderRoute(NEW, 'provider', {
      actor: (keys) => ({ ...actorFor('provider', keys), userId: keys.users['tom'] }),
    });
    expect(await screen.findByText(/don't have permission/i)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Organisation name' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create client' })).toBeNull();
  });
});

describe('P2 Clients page link', () => {
  it('has a New client link to the wizard', async () => {
    await renderRoute('/provider/clients', 'provider');
    const link = await screen.findByRole('link', { name: 'New client' });
    expect(link.getAttribute('href')).toBe('#/provider/clients/new');
  });
});
