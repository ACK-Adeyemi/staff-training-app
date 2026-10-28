// M3 chunk 19a (BP-17, F-4, F-5; Track A step 8): the multi-site client pages, C2 People grouped by site, C1 site
// comparison, and the site switcher filtering the client pages. Written before the implementation.
//
// UI CONTRACT (data layer = store.people, sites, requirements, evidence, assignments; domain = sites/rollup.ts
// `siteRollup`, `siteComparison`, `viewForSite`; the switcher is the existing SiteScopeContext / useSiteScope() from
// app/siteScope.ts, set by the shell's select "Switch site". Do NOT add a second filter context: reuse it. All text
// comes from language files. Multi-site UI exists only when `sites.list` returns more than one site for the actor.)
//
//   C2 People, /client/people, multi-site actor (Fiona: Riverside, Hillside, Meadow):
//     A radiogroup "View" with radios "By site" (default) and "One list". Not rendered for a one-site actor.
//     By site: one element data-testid="site-group" per site shown, each containing a button whose accessible name is
//       exactly the site name, with aria-expanded ("true" by default), and an element data-testid="site-group-stats"
//       whose text holds "<n> people" (or "1 person"), "Compliance <n>%", "<n> overdue" and "<n> expiring soon".
//       n people = the site's non-archived people by PRIMARY site. Expanded groups list a person link per person
//       (href #/client/people/<id>, text "First Last"); collapsed groups remove those links but keep the stats.
//     One list: no site-group at all; every non-archived person once, as before.
//     A person who works at several sites (Nadia Bell: Riverside, also Meadow) is one link, in her primary site's group.
//     With the switcher on one site only that site's group shows. A region "Also works here" (h2 inside it or its
//       label) then lists floating people from other primary sites as plain links; they are not counted in the group's
//       "<n> people" and not in the site-group. It is absent when nobody floats in, and when the switcher is on All sites.
//     A Site Manager (Tariq, Riverside only) sees only Riverside people and only the Riverside group; no switcher.
//   C1 Dashboard, /client: a region "Site comparison" (h2) only when the switcher is on All sites and the actor can read
//     more than one site. One li data-testid="site-card" per site, most attention first (lowest compliance, then most
//     overdue). Each card text has the site name, "Compliance <n>%", "<n> overdue", "<n> expiring soon",
//     "Completion <n>%" and "<n> staff", and a button "Open <site>" which sets the switcher to that site (the select
//     "Switch site" then has that site's id) and removes the comparison region. With one site chosen the other
//     dashboard lists only show people whose primary site it is.
//   C15 Training matrix and C9 Stats follow the switcher in the same way (rows are that site's people only).
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
const clientActor =
  (userKey: string, clientKey: string) =>
  (keys: SeedKeys): ActorContext => ({
    userId: need(keys.users[userKey]),
    side: 'client',
    clientId: need(keys.clients[clientKey]),
    now: TODAY,
  });
const fiona = clientActor('oakTreeGroupAdmin', 'oakTree');
const tariq = clientActor('riversideManager', 'oakTree');
const priya = clientActor('priya', 'littleAcorns');

const dump = async <R,>(handle: StoreHandle, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as Record<string, unknown[]>)[store] as R[];
const name = (p: Person) => `${p.firstName} ${p.lastName}`;

type World = { sites: Site[]; people: Person[]; keys: SeedKeys };
async function world(view: { handle: StoreHandle; keys: SeedKeys }): Promise<World> {
  const clientId = need(view.keys.clients['oakTree']);
  const sites = (await dump<Site>(view.handle, 'sites')).filter((s) => s.clientId === clientId);
  const people = (await dump<Person>(view.handle, 'people')).filter(
    (p) => p.clientId === clientId && p.status !== 'archived',
  );
  return { sites, people, keys: view.keys };
}
const siteNamed = (w: World, n: string): Site => need(w.sites.find((s) => s.name === n));
const peopleAt = (w: World, n: string): Person[] => w.people.filter((p) => p.primarySiteId === siteNamed(w, n).id);
const groupFor = (siteName: string): HTMLElement => {
  const button = screen.getByRole('button', { name: siteName });
  return need(button.closest<HTMLElement>('[data-testid="site-group"]'));
};
const personLinks = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="#/client/people/"]'));
async function chooseSite(siteId: string) {
  await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Switch site' }), siteId);
}

describe('C2 People grouped by site (BP-17)', () => {
  it("groups Oak Tree by site with counts, compliance, overdue and expiring, and lists each site's people", async () => {
    const view = await renderRoute('/client/people', 'client', { actor: fiona });
    const w = await world(view);
    await screen.findByRole('heading', { level: 1, name: 'People' });
    await waitFor(() => {
      expect(screen.getAllByTestId('site-group')).toHaveLength(3);
    });
    for (const s of w.sites) {
      const group = groupFor(s.name);
      const n = peopleAt(w, s.name).length;
      const stats = within(group).getByTestId('site-group-stats').textContent;
      expect(stats).toContain(n === 1 ? '1 person' : `${String(n)} people`);
      expect(stats).toMatch(/Compliance \d+%/);
      expect(stats).toMatch(/\d+ overdue/);
      expect(stats).toMatch(/\d+ expiring soon/);
      expect(screen.getByRole('button', { name: s.name }).getAttribute('aria-expanded')).toBe('true');
      expect(
        personLinks(group)
          .map((a) => a.textContent)
          .sort(),
      ).toEqual(peopleAt(w, s.name).map(name).sort());
    }
  });

  it('collapses a site: its people disappear, its counts stay, and the others are untouched', async () => {
    const view = await renderRoute('/client/people', 'client', { actor: fiona });
    const w = await world(view);
    await waitFor(() => {
      expect(screen.getAllByTestId('site-group')).toHaveLength(3);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Hillside' }));
    expect(screen.getByRole('button', { name: 'Hillside' }).getAttribute('aria-expanded')).toBe('false');
    expect(personLinks(groupFor('Hillside'))).toHaveLength(0);
    expect(within(groupFor('Hillside')).getByTestId('site-group-stats').textContent).toContain(
      `${String(peopleAt(w, 'Hillside').length)} people`,
    );
    expect(personLinks(groupFor('Riverside')).length).toBe(peopleAt(w, 'Riverside').length);
    await userEvent.click(screen.getByRole('button', { name: 'Hillside' }));
    expect(personLinks(groupFor('Hillside')).length).toBe(peopleAt(w, 'Hillside').length);
  });

  it('counts Nadia (bank, Riverside and Meadow) once, under her primary site', async () => {
    await renderRoute('/client/people', 'client', { actor: fiona });
    await waitFor(() => {
      expect(screen.getAllByTestId('site-group')).toHaveLength(3);
    });
    const nadia = personLinks(document.body).filter((a) => a.textContent === 'Nadia Bell');
    expect(nadia).toHaveLength(1);
    expect(groupFor('Riverside').contains(nadia[0] ?? null)).toBe(true);
  });

  it('offers one flat list instead, with every person once and no groups', async () => {
    const view = await renderRoute('/client/people', 'client', { actor: fiona });
    const w = await world(view);
    await waitFor(() => {
      expect(screen.getAllByTestId('site-group')).toHaveLength(3);
    });
    const view_ = screen.getByRole('radiogroup', { name: 'View' });
    expect(within(view_).getByRole<HTMLInputElement>('radio', { name: 'By site' }).checked).toBe(true);
    await userEvent.click(within(view_).getByRole('radio', { name: 'One list' }));
    expect(screen.queryAllByTestId('site-group')).toHaveLength(0);
    expect(
      personLinks(document.body)
        .map((a) => a.textContent)
        .sort(),
    ).toEqual(w.people.map(name).sort());
  });

  it('narrows to Meadow when the switcher says Meadow, and lists Nadia under Also works here without counting her', async () => {
    const view = await renderRoute('/client/people', 'client', { actor: fiona });
    const w = await world(view);
    await waitFor(() => {
      expect(screen.getAllByTestId('site-group')).toHaveLength(3);
    });
    await chooseSite(siteNamed(w, 'Meadow').id);
    await waitFor(() => {
      expect(screen.getAllByTestId('site-group')).toHaveLength(1);
    });
    const group = groupFor('Meadow');
    expect(
      personLinks(group)
        .map((a) => a.textContent)
        .sort(),
    ).toEqual(peopleAt(w, 'Meadow').map(name).sort());
    expect(within(group).getByTestId('site-group-stats').textContent).toContain(
      `${String(peopleAt(w, 'Meadow').length)} people`,
    );
    const also = await screen.findByRole('region', { name: 'Also works here' });
    expect(within(also).getByRole('link', { name: 'Nadia Bell' })).toBeTruthy();
    expect(group.contains(also)).toBe(false);
    expect(personLinks(group).some((a) => a.textContent === 'Nadia Bell')).toBe(false);
  });

  it('shows no Also works here list on All sites', async () => {
    await renderRoute('/client/people', 'client', { actor: fiona });
    await waitFor(() => {
      expect(screen.getAllByTestId('site-group')).toHaveLength(3);
    });
    expect(screen.queryByRole('region', { name: 'Also works here' })).toBeNull();
  });

  it('shows Tariq (Riverside Site Manager) only Riverside, with Nadia once and no switcher', async () => {
    const view = await renderRoute('/client/people', 'client', { actor: tariq });
    const w = await world(view);
    await screen.findByRole('heading', { level: 1, name: 'People' });
    await waitFor(() => {
      expect(personLinks(document.body).length).toBeGreaterThan(0);
    });
    const shown = personLinks(document.body).map((a) => a.textContent);
    expect([...shown].sort()).toEqual(peopleAt(w, 'Riverside').map(name).sort());
    expect(shown.filter((n) => n === 'Nadia Bell')).toHaveLength(1);
    const groups = screen.queryAllByTestId('site-group');
    expect(groups.length).toBeLessThanOrEqual(1);
    for (const g of groups) expect(within(g).queryByRole('button', { name: 'Riverside' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Switch site' })).toBeNull();
  });

  it('keeps a one-site client as a plain list: no groups and no View choice', async () => {
    await renderRoute('/client/people', 'client', { actor: priya });
    await screen.findByRole('heading', { level: 1, name: 'People' });
    await waitFor(() => {
      expect(personLinks(document.body).length).toBeGreaterThan(0);
    });
    expect(screen.queryAllByTestId('site-group')).toHaveLength(0);
    expect(screen.queryByRole('radiogroup', { name: 'View' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Switch site' })).toBeNull();
  });
});

const percent = (text: string): number => Number(/Compliance (\d+)%/.exec(text)?.[1]);

describe('C1 Dashboard site comparison (BP-17, Track A step 8)', () => {
  it('lists every site, the one needing most attention first, with its figures', async () => {
    const view = await renderRoute('/client', 'client', { actor: fiona });
    const w = await world(view);
    const region = await screen.findByRole('region', { name: 'Site comparison' });
    const cards = within(region).getAllByTestId('site-card');
    expect(cards).toHaveLength(3);
    const texts = cards.map((c) => c.textContent);
    for (const text of texts) {
      expect(text).toMatch(/Compliance \d+%/);
      expect(text).toMatch(/\d+ overdue/);
      expect(text).toMatch(/\d+ expiring soon/);
      expect(text).toMatch(/Completion \d+%/);
      expect(text).toMatch(/\d+ staff/);
    }
    const compliance = texts.map(percent);
    expect(compliance).toEqual([...compliance].sort((a, b) => a - b));
    expect(texts[0]).toContain('Meadow');
    expect(texts[2]).toContain('Riverside');
    // Floating Nadia is counted once, at Riverside.
    const riverside = need(cards.find((c) => c.textContent.includes('Riverside')));
    expect(riverside.textContent).toContain(`${String(peopleAt(w, 'Riverside').length)} staff`);
  });

  it('drills into Meadow: the switcher shows Meadow, the comparison goes and the lists narrow to Meadow people', async () => {
    const view = await renderRoute('/client', 'client', { actor: fiona });
    const w = await world(view);
    const region = await screen.findByRole('region', { name: 'Site comparison' });
    await userEvent.click(within(region).getByRole('button', { name: 'Open Meadow' }));
    const meadow = siteNamed(w, 'Meadow');
    await waitFor(() => {
      expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Switch site' }).value).toBe(meadow.id);
    });
    expect(screen.queryByRole('region', { name: 'Site comparison' })).toBeNull();
    const meadowIds = new Set(peopleAt(w, 'Meadow').map((p) => p.id));
    await waitFor(() => {
      const hrefs = personLinks(document.body).map((a) => a.getAttribute('href')?.split('/').pop() ?? '');
      expect(hrefs.length).toBeGreaterThan(0);
      for (const id of hrefs) expect(meadowIds.has(id)).toBe(true);
    });
  });

  it('shows no comparison to a Site Manager or to a one-site client', async () => {
    await renderRoute('/client', 'client', { actor: tariq });
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await screen.findAllByRole('region');
    expect(screen.queryByRole('region', { name: 'Site comparison' })).toBeNull();
    cleanup();
    await renderRoute('/client', 'client', { actor: priya });
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await screen.findAllByRole('region');
    expect(screen.queryByRole('region', { name: 'Site comparison' })).toBeNull();
  });
});

describe('the site switcher filters the other client pages (BP-17)', () => {
  const matrixNames = () => {
    const table = screen.getByRole('table', { name: /training matrix/i });
    return Array.from(table.querySelectorAll('tbody tr')).map((r) => r.textContent);
  };
  const countOf = (rows: string, p: Person) => rows.split(name(p)).length - 1;
  const matrixText = () => matrixNames().join('|');
  const matrixHas = (names: string[]) => {
    const rows = matrixText();
    return names.every((n) => rows.includes(n));
  };

  it("narrows the training matrix to the chosen site's people", async () => {
    const view = await renderRoute('/client/reports/matrix', 'client', { actor: fiona });
    const w = await world(view);
    await screen.findByRole('table', { name: /training matrix/i });
    await waitFor(() => {
      expect(matrixText()).toContain('Toby Ashby');
    });
    for (const p of w.people) expect(countOf(matrixText(), p)).toBe(1);
    await chooseSite(siteNamed(w, 'Meadow').id);
    const meadow = peopleAt(w, 'Meadow');
    await waitFor(() => {
      expect(matrixText()).not.toContain('Nadia Bell');
    });
    expect(matrixHas(meadow.map(name))).toBe(true);
    for (const p of [...peopleAt(w, 'Riverside'), ...peopleAt(w, 'Hillside')])
      expect(matrixText()).not.toContain(name(p));
  });

  it('lists each person once in the matrix for Tariq, with only Riverside people', async () => {
    const view = await renderRoute('/client/reports/matrix', 'client', { actor: tariq });
    const w = await world(view);
    await screen.findByRole('table', { name: /training matrix/i });
    await waitFor(() => {
      expect(matrixHas(peopleAt(w, 'Riverside').map(name))).toBe(true);
    });
    const rows = matrixText();
    expect(rows.split('Nadia Bell').length - 1).toBe(1);
    for (const p of [...peopleAt(w, 'Meadow'), ...peopleAt(w, 'Hillside')]) expect(rows).not.toContain(name(p));
  });

  it('lets Fiona see all three sites in Stats but Tariq see no By site breakdown', async () => {
    await renderRoute('/client/stats', 'client', { actor: fiona });
    expect(await screen.findByRole('region', { name: 'By site' })).toBeTruthy();
    cleanup();
    await renderRoute('/client/stats', 'client', { actor: tariq });
    await screen.findByRole('heading', { level: 1, name: 'Stats' });
    await screen.findByRole('region', { name: 'By requirement' });
    expect(screen.queryByRole('region', { name: 'By site' })).toBeNull();
  });
});
