// BP-18: the `scope` input added to standingBoard (plan M3 Design; assumption 38).
//
// API under test (standingBoards.ts): BoardInput gains an optional
//   scope?: { scope: LeaderboardScope; viewerSiteId: string; sites: Site[] }
// and the people on every board are narrowed with peopleInScope. Without `scope` nothing changes (existing tests).
import { describe, expect, it } from 'vitest';
import { standingBoard } from '../standingBoards';
import { bank, boardInput, correct } from '../competitions/testFixtures';
import { siteNamed, staffAt } from '../sites/testFixtures';

const here = siteNamed('Riverside', { region: 'South East' });
const near = siteNamed('Meadow', { region: 'South East' });
const far = siteNamed('Hilltop', { region: 'South West' });
const sites = [here, near, far];
const ann = staffAt(here, 'Ann', 'Adams');
const bob = staffAt(near, 'Bob', 'Brown');
const cy = staffAt(far, 'Cy', 'Clarke');
const m = bank(['q1']);
const events = [correct(ann, m, 'q1', '2026-10-12T10:00:00.000Z'), correct(cy, m, 'q1', '2026-10-12T10:00:00.000Z')];
const run = (scope?: 'site' | 'region' | 'country' | 'all') =>
  standingBoard(
    'correctQuestions',
    'allTime',
    boardInput({
      people: [ann, bob, cy],
      events,
      modules: [m],
      ...(scope ? { scope: { scope, viewerSiteId: here.id, sites } } : {}),
    }),
  );

describe('standingBoard scope', () => {
  it('without a scope includes everyone, as before', () => {
    expect([...run().values.keys()].sort()).toEqual([ann.id, bob.id, cy.id].sort());
  });

  it('My site keeps only the viewer site', () => {
    expect([...run('site').values.keys()]).toEqual([ann.id]);
  });

  it('My region adds sites in the same region and not others', () => {
    expect([...run('region').values.keys()].sort()).toEqual([ann.id, bob.id].sort());
  });

  it('All sites includes everyone, with zeros', () => {
    const r = run('all');
    expect([...r.values.keys()].sort()).toEqual([ann.id, bob.id, cy.id].sort());
    expect(r.values.get(bob.id)).toBe(0);
    expect(r.values.get(cy.id)).toBe(1);
  });
});
