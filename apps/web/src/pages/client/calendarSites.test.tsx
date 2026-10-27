// M3 chunk 18b: C28 respects site scope. Oak Tree has two sites (Riverside and Meadow). The group admin sees both and the
// site switcher narrows the calendar; a Site Manager sees only people at their own site.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActorContext, StoreHandle } from '@sta/data';
import type { Person, Site } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { renderRoute, TODAY } from '../../test/harness';

afterEach(cleanup);

const need = <T,>(v: T | null | undefined): T => {
  if (v === undefined || v === null) throw new Error('missing');
  return v;
};
const oak =
  (userKey: string) =>
  (keys: SeedKeys): ActorContext => ({
    userId: need(keys.users[userKey]),
    side: 'client',
    clientId: need(keys.clients['oakTree']),
    now: TODAY,
  });
const items = () => Array.from(document.querySelectorAll<HTMLElement>('li[data-kind]'));
const dump = async <R,>(handle: { admin: { dumpAll: () => Promise<unknown> } }, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as Record<string, unknown[]>)[store] as R[];
const named = (li: HTMLElement) =>
  li.getAttribute('data-kind') === 'expiry' || li.getAttribute('data-kind') === 'assignmentDue';

async function expandAll() {
  for (let i = 0; i < 6 && screen.queryByRole('button', { name: 'See further' }); i++) {
    await userEvent.click(screen.getByRole('button', { name: 'See further' }));
  }
}

async function peopleAt(handle: Parameters<typeof dump>[0], site: Site): Promise<string[]> {
  return (await dump<Person>(handle, 'people'))
    .filter((p) => p.primarySiteId === site.id)
    .map((p) => p.nickname ?? `${p.firstName} ${p.lastName.charAt(0).toUpperCase()}.`);
}

// Oak Tree's seeded people carry no dated requirements, so give one person at every site an assignment due in a week.
async function giveEverySiteSomethingDue({ handle, keys }: { handle: StoreHandle; keys: SeedKeys }) {
  const admin = oak('oakTreeGroupAdmin')(keys);
  const people = (await dump<Person>(handle, 'people')).filter((p) => p.clientId === admin.clientId);
  const module = need((await handle.store.modules.list(admin)).find((m) => m.status === 'published'));
  const bySite = new Map<string, Person>();
  for (const p of people) if (p.status === 'active' && !bySite.has(p.primarySiteId)) bySite.set(p.primarySiteId, p);
  for (const p of bySite.values()) {
    await handle.store.assignments.assign(admin, {
      moduleId: module.id,
      personIds: [p.id],
      dueAt: '2026-10-26T09:00:00.000Z',
    });
  }
}

describe('C28 site scope (multi-site client)', () => {
  it('narrows the items to the chosen site for a group admin', async () => {
    const view = await renderRoute('/client/calendar', 'client', {
      actor: oak('oakTreeGroupAdmin'),
      prepare: giveEverySiteSomethingDue,
    });
    await screen.findByRole('heading', { level: 1, name: 'Calendar' });
    await waitFor(() => {
      expect(items().length).toBeGreaterThan(0);
    });
    const sites = await dump<Site>(view.handle, 'sites');
    const riverside = need(sites.find((s) => s.name.includes('Riverside')));
    const meadow = need(sites.find((s) => s.name.includes('Meadow')));
    const siteFilter = within(screen.getByRole('group', { name: 'Filters' })).getByRole('combobox', { name: 'Site' });
    expect(within(siteFilter).getAllByRole('option').length).toBeGreaterThanOrEqual(3);
    await expandAll();
    const before = items().filter(named).length;
    expect(before).toBeGreaterThan(0);

    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Switch site' }), riverside.id);
    const riversidePeople = await peopleAt(view.handle, riverside);
    const meadowPeople = await peopleAt(view.handle, meadow);
    await waitFor(() => {
      const shown = items().filter(named);
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.length).toBeLessThan(before);
      for (const li of shown) {
        expect(riversidePeople.some((n) => li.textContent.startsWith(`${n}:`))).toBe(true);
        expect(meadowPeople.some((n) => li.textContent.startsWith(`${n}:`))).toBe(false);
      }
    });
  });

  it('shows a Site Manager only the people at their own site, with no Site filter', async () => {
    const view = await renderRoute('/client/calendar', 'client', {
      actor: oak('riversideManager'),
      prepare: giveEverySiteSomethingDue,
    });
    await screen.findByRole('heading', { level: 1, name: 'Calendar' });
    await waitFor(() => {
      expect(items().length).toBeGreaterThan(0);
    });
    await expandAll();
    expect(items().filter(named).length).toBeGreaterThan(0);
    const sites = await dump<Site>(view.handle, 'sites');
    const meadow = need(sites.find((s) => s.name.includes('Meadow')));
    const meadowPeople = await peopleAt(view.handle, meadow);
    for (const li of items().filter(named)) {
      expect(meadowPeople.some((n) => li.textContent.startsWith(`${n}:`))).toBe(false);
    }
    expect(within(screen.getByRole('group', { name: 'Filters' })).queryByRole('combobox', { name: 'Site' })).toBeNull();
  });
});
