// M4 chunk 14c (U layer): P17 "Status and incidents" at /provider/status (BP-12, brief 26.5). Written before the
// implementation (component `Status` in ./Status.tsx).
//
// UI CONTRACT
//   Data: store.incidents.list, post, update (incidents.post), store.incidents.current (status), store.maintenance.set
//   ({ app, on }) and flags. Controls show only when holdsAnywhere(perms, <permission>) (never role names).
//   The page re-renders after a change (the store notifies subscribers).
//   Proposed language keys (en-GB):
//     provider.status.heading "Status and incidents"   .noAccess "You do not have access to status and incidents."
//     provider.status.current "Current status"  .level.{normal,degraded,maintenance,incident}
//       "Normal", "Degraded", "Maintenance", "Incident"
//     provider.status.update.{investigating,identified,monitoring,resolved}
//       "Investigating", "Identified", "Monitoring", "Resolved"
//     provider.status.post.* "Post incident": comboboxes "Level" (Degraded / Incident), textboxes "Title" and "Message",
//       button "Post incident"; blank title shows role=alert "Enter a title for the incident."
//     provider.status.addUpdate "Add update": combobox "Status" (Identified / Monitoring / Resolved), textbox "Message",
//       button "Add update"
//     provider.status.maintenance "Maintenance"  .banner "The banner will say: {message}" (message text not asserted)
//   P17 /provider/status:
//     - h1 "Status and incidents".
//     - Region "Current status": the level as a word ("Normal" / "Incident" ...) plus a short message; during an incident
//       it also contains the incident title.
//     - data-testid="incident-row" per list() row (same order), data-incident-id. Inside it: title, a level word,
//       data-testid="incident-update" per update in time order (status word + message), and "Resolved" once resolved.
//       An unresolved incident row has the form (combobox "Status", textbox "Message", button "Add update");
//       a resolved one has none of those.
//     - Region "Post incident" with the form (incidents.post).
//     - Region "Maintenance": switches (role=switch, aria-checked) named "Staff", "Client", "Provider", reflecting
//       store.maintenance.flags (ops.write to toggle); text saying what the banner will say (contains "banner").
//     - No incidents.post: only the no-access message.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { Incident } from '@sta/domain';
import { actorFor, renderRoute } from '../../test/harness';

afterEach(cleanup);

type Opts = Parameters<typeof renderRoute>[2];
const as = (key: string): Opts => ({ actor: (keys) => ({ ...actorFor('provider', keys), userId: keys.users[key]! }) });

const openP17 = async (opts?: Opts) => {
  const view = await renderRoute('/provider/status', 'provider', opts);
  await screen.findByRole('heading', { level: 1, name: 'Status and incidents' });
  return view;
};
const rows = () => screen.getAllByTestId('incident-row');
const current = () => screen.getByRole('region', { name: 'Current status' });
const stored = async (view: Awaited<ReturnType<typeof openP17>>) =>
  (await view.handle.admin.dumpAll())['incidents'] as Incident[];

const postIncident = async (level: 'Degraded' | 'Incident', title: string, message: string) => {
  const form = screen.getByRole('region', { name: 'Post incident' });
  await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Level' }), level);
  if (title) await userEvent.type(within(form).getByRole('textbox', { name: 'Title' }), title);
  if (message) await userEvent.type(within(form).getByRole('textbox', { name: 'Message' }), message);
  await userEvent.click(within(form).getByRole('button', { name: 'Post incident' }));
};
const addUpdate = async (row: HTMLElement, status: string, message: string) => {
  await userEvent.selectOptions(within(row).getByRole('combobox', { name: 'Status' }), status);
  await userEvent.type(within(row).getByRole('textbox', { name: 'Message' }), message);
  await userEvent.click(within(row).getByRole('button', { name: 'Add update' }));
};

describe('P17 Status and incidents', () => {
  it('shows the current status as the word Normal with a short message, and the past resolved incident with updates in order', async () => {
    const view = await openP17();
    expect(current().textContent).toContain('Normal');
    expect(current().textContent.replace('Normal', '').replace('Current status', '').trim().length).toBeGreaterThan(5);
    expect(rows()).toHaveLength(1);
    const seeded = (await stored(view))[0]!;
    const row = rows()[0]!;
    expect(row.getAttribute('data-incident-id')).toBe(seeded.id);
    expect(row.textContent).toContain(seeded.title);
    expect(row.textContent).toContain('Resolved');
    const updates = within(row).getAllByTestId('incident-update');
    expect(updates).toHaveLength(seeded.updates.length);
    const words = updates.map((u) => /Investigating|Identified|Monitoring|Resolved/.exec(u.textContent)![0]);
    expect(words).toEqual(['Investigating', 'Identified', 'Resolved']);
    seeded.updates.forEach((u, i) => {
      expect(updates[i]!.textContent).toContain(u.message);
    });
  });

  it('offers no update controls on the resolved seeded incident', async () => {
    await openP17();
    expect(within(rows()[0]!).queryAllByRole('button', { name: 'Add update' })).toHaveLength(0);
    expect(within(rows()[0]!).queryAllByRole('combobox', { name: 'Status' })).toHaveLength(0);
  });

  it('posts an incident: status becomes the word Incident with the title and the incident shows Investigating', async () => {
    const view = await openP17();
    await postIncident('Incident', 'Sign-in problems', 'Some people cannot sign in. We are looking into it.');
    await waitFor(() => {
      expect(rows()).toHaveLength(2);
    });
    expect(current().textContent).toContain('Incident');
    expect(current().textContent).toContain('Sign-in problems');
    expect(current().textContent).not.toContain('Normal');
    const created = (await stored(view)).find((i) => i.title === 'Sign-in problems')!;
    expect(created.level).toBe('incident');
    expect(created.resolvedAt).toBeUndefined();
    expect(created.updates.map((u) => u.status)).toEqual(['investigating']);
    const row = rows().find((r) => r.getAttribute('data-incident-id') === created.id)!;
    expect(row.textContent).toContain('Investigating');
    expect(row.textContent).toContain('Some people cannot sign in. We are looking into it.');
    expect(within(row).getByRole('button', { name: 'Add update' })).toBeTruthy();
  });

  it('posts a Degraded incident and the status becomes Degraded', async () => {
    await openP17();
    await postIncident('Degraded', 'Slow pages', 'Pages are slow.');
    await waitFor(() => {
      expect(current().textContent).toContain('Degraded');
    });
    expect(current().textContent).toContain('Slow pages');
  });

  it('adds Identified then Monitoring updates and the status stays on the incident', async () => {
    const view = await openP17();
    await postIncident('Incident', 'Sign-in problems', 'Looking into it.');
    await waitFor(() => {
      expect(rows()).toHaveLength(2);
    });
    const id = (await stored(view)).find((i) => i.title === 'Sign-in problems')!.id;
    const rowOf = () => rows().find((r) => r.getAttribute('data-incident-id') === id)!;
    await addUpdate(rowOf(), 'Identified', 'We found the cause.');
    await waitFor(() => {
      expect(within(rowOf()).getAllByTestId('incident-update')).toHaveLength(2);
    });
    await addUpdate(rowOf(), 'Monitoring', 'A fix is out and we are watching it.');
    await waitFor(() => {
      expect(within(rowOf()).getAllByTestId('incident-update')).toHaveLength(3);
    });
    const words = within(rowOf())
      .getAllByTestId('incident-update')
      .map((u) => /Investigating|Identified|Monitoring|Resolved/.exec(u.textContent)![0]);
    expect(words).toEqual(['Investigating', 'Identified', 'Monitoring']);
    expect(current().textContent).toContain('Incident');
    expect((await stored(view)).find((i) => i.id === id)!.resolvedAt).toBeUndefined();
  });

  it('Resolved returns the status to Normal and removes the update controls', async () => {
    const view = await openP17();
    await postIncident('Incident', 'Sign-in problems', 'Looking into it.');
    await waitFor(() => {
      expect(rows()).toHaveLength(2);
    });
    const id = (await stored(view)).find((i) => i.title === 'Sign-in problems')!.id;
    const rowOf = () => rows().find((r) => r.getAttribute('data-incident-id') === id)!;
    await addUpdate(rowOf(), 'Resolved', 'Everything is working again.');
    await waitFor(() => {
      expect(current().textContent).toContain('Normal');
    });
    expect(current().textContent).not.toContain('Sign-in problems');
    expect(rowOf().textContent).toContain('Resolved');
    expect(rowOf().textContent).toContain('Everything is working again.');
    expect(within(rowOf()).queryAllByRole('button', { name: 'Add update' })).toHaveLength(0);
    expect(within(rowOf()).queryAllByRole('combobox', { name: 'Status' })).toHaveLength(0);
    const after = (await stored(view)).find((i) => i.id === id)!;
    expect(after.resolvedAt).toBeDefined();
    expect(after.updates.at(-1)!.status).toBe('resolved');
  });

  it('has a maintenance switch for each app, off to start, with text about the banner', async () => {
    await openP17();
    const region = screen.getByRole('region', { name: 'Maintenance' });
    for (const name of ['Staff', 'Client', 'Provider']) {
      const sw = within(region).getByRole('switch', { name });
      expect(sw.getAttribute('aria-checked')).toBe('false');
    }
    expect(region.textContent.toLowerCase()).toContain('banner');
  });

  it('turning on the Client switch calls maintenance.set and the flags reflect it, leaving the others off', async () => {
    const view = await openP17();
    const region = screen.getByRole('region', { name: 'Maintenance' });
    await userEvent.click(within(region).getByRole('switch', { name: 'Client' }));
    await waitFor(() => {
      expect(within(region).getByRole('switch', { name: 'Client' }).getAttribute('aria-checked')).toBe('true');
    });
    const flags = await view.handle.store.maintenance.flags(actorFor('provider', view.keys));
    expect(flags).toEqual({ staff: false, client: true, provider: false });
    expect(within(region).getByRole('switch', { name: 'Staff' }).getAttribute('aria-checked')).toBe('false');
  });

  it('turns a maintenance switch back off', async () => {
    const view = await openP17({
      prepare: async ({ handle, keys }) => {
        await handle.store.maintenance.set(actorFor('provider', keys), { app: 'staff', on: true });
      },
    });
    const region = screen.getByRole('region', { name: 'Maintenance' });
    const sw = within(region).getByRole('switch', { name: 'Staff' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    await userEvent.click(sw);
    await waitFor(() => {
      expect(within(region).getByRole('switch', { name: 'Staff' }).getAttribute('aria-checked')).toBe('false');
    });
    expect((await view.handle.store.maintenance.flags(actorFor('provider', view.keys))).staff).toBe(false);
  });

  it('shows an error and creates nothing when the title is blank', async () => {
    const view = await openP17();
    await postIncident('Incident', '', 'Some message');
    expect((await screen.findByRole('alert')).textContent).toContain('Enter a title for the incident.');
    expect(rows()).toHaveLength(1);
    expect(await stored(view)).toHaveLength(1);
    expect(current().textContent).toContain('Normal');
  });

  it('shows only a no-access message to a user without incidents.post', async () => {
    await renderRoute('/provider/status', 'provider', as('tom'));
    expect(await screen.findByText('You do not have access to status and incidents.')).toBeTruthy();
    expect(screen.queryAllByTestId('incident-row')).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: 'Post incident' })).toHaveLength(0);
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
  });
});
