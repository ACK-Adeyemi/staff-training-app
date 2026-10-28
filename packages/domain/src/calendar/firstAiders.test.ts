// BP-13, BP-15: the first aiders forecast and current list (plan M3 assumption 23; brief 28.3, 27.4; EYFS 3.37).
//
// API under test (calendar/firstAiders.ts), pure. The domain does not know the pack's requirement key: the caller passes the
// first aid Requirement.
//   type Input = { people: Person[]; sites: Site[]; requirement: Requirement; evidence: Evidence[]; now: Date }
//   currentFirstAiders(input) => { person: Person; evidence: Evidence }[]
//     Active people only (not on leave, invited or archived) whose latest Evidence for the requirement has not expired at `now`
//     (expiry = evidence.expiresAt, else completedAt + requirement.renewEveryMonths). Sorted by last name then first name.
//     The evidence is passed through, so the list can show who approved a certificate and when.
//   firstAiderForecast(input & { threshold: number; weeks?: number }) => { all: Week[]; bySite: Record<siteId, Week[]> }
//     Week = { weekStart: 'YYYY-MM-DD' (London Monday); count: number; belowThreshold: boolean }
//     `weeks` (default 12) weeks starting with the Monday of the current London week. count = active people whose latest
//     Evidence is still current at 00:00 London on that Monday, per site by PRIMARY site. belowThreshold = count < threshold.
import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import { currentFirstAiders, firstAiderForecast } from './firstAiders';
import { NOW, evidenceExpiring, requirement, siteNamed, staffAt } from '../sites/testFixtures';

const aid = requirement('Paediatric first aid', { renewEveryMonths: 36 });
const a = siteNamed('Riverside');
const b = siteNamed('Meadow');
const p1 = staffAt(a, 'Mark', 'Taylor'); // expires in 20 days: Sunday 8 November
const p2 = staffAt(a, 'Lucy', 'Evans');
const p3 = staffAt(b, 'Lee', 'Away', { status: 'onLeave' });
const p4 = staffAt(b, 'Dan', 'Okafor');
const p5 = staffAt(b, 'Ina', 'Invited', { status: 'invited' });
const p6 = staffAt(b, 'Nia', 'None');
const people = [p1, p2, p3, p4, p5, p6];
const evidence = [
  evidenceExpiring(p1, aid, 20),
  evidenceExpiring(p2, aid, 365),
  evidenceExpiring(p3, aid, 365),
  evidenceExpiring(p4, aid, 200),
  evidenceExpiring(p5, aid, 365),
];
const input = { people, sites: [a, b], requirement: aid, evidence, now: NOW };

describe('currentFirstAiders', () => {
  it('lists active people with a current certificate, by last name', () => {
    expect(currentFirstAiders(input).map((r) => r.person.id)).toEqual([p2.id, p4.id, p1.id]); // Evans, Okafor, Taylor
  });

  it('leaves out an expired certificate and a person with none', () => {
    const r = currentFirstAiders({
      ...input,
      evidence: [evidenceExpiring(p1, aid, -1), evidenceExpiring(p2, aid, 10)],
    });
    expect(r.map((x) => x.person.id)).toEqual([p2.id]);
  });

  it('uses the latest evidence when there are several', () => {
    const old = evidenceExpiring(p1, aid, -30);
    const renewed = evidenceExpiring(p1, aid, 400);
    const r = currentFirstAiders({ ...input, evidence: [old, renewed] });
    expect(r).toEqual([expect.objectContaining({ person: p1, evidence: renewed })]);
  });

  it('works out expiry from the renewal period when the evidence has none', () => {
    const e = { ...evidenceExpiring(p1, aid, 0), expiresAt: undefined, completedAt: addDays(NOW, -30).toISOString() };
    expect(currentFirstAiders({ ...input, evidence: [e] })).toHaveLength(1);
    const old = { ...e, completedAt: addDays(NOW, -365 * 4).toISOString() };
    expect(currentFirstAiders({ ...input, evidence: [old] })).toEqual([]);
  });

  it('passes through who approved an external certificate and when', () => {
    const e = evidenceExpiring(p1, aid, 100, { kind: 'external', approvedBy: 'u1', approvedAt: NOW.toISOString() });
    expect(currentFirstAiders({ ...input, evidence: [e] })[0]!.evidence).toMatchObject({ approvedBy: 'u1' });
  });
});

describe('firstAiderForecast', () => {
  const f = firstAiderForecast({ ...input, threshold: 2 });

  it('covers 12 London weeks starting with the Monday of this week', () => {
    expect(f.all).toHaveLength(12);
    expect(f.all[0]!.weekStart).toBe('2026-10-19');
    expect(f.all[1]!.weekStart).toBe('2026-10-26');
    expect(f.all[11]!.weekStart).toBe('2027-01-04');
  });

  it('counts a certificate until the Monday after it expires', () => {
    // p1 expires Sunday 8 November: still current on Monday 2 November, gone on Monday 9 November.
    expect(f.bySite[a.id]!.map((w) => w.count).slice(0, 4)).toEqual([2, 2, 2, 1]);
  });

  it('counts the whole client in all, leaving out leave, invited and people without a certificate', () => {
    expect(f.all.map((w) => w.count).slice(0, 4)).toEqual([3, 3, 3, 2]); // p1, p2, p4 then p2, p4
  });

  it('splits by primary site', () => {
    expect(f.bySite[b.id]!.every((w) => w.count === 1)).toBe(true);
  });

  it('warns only when the count is below the threshold, not when it equals it', () => {
    expect(f.bySite[a.id]!.map((w) => w.belowThreshold).slice(0, 4)).toEqual([false, false, false, true]);
    expect(f.all[3]!.belowThreshold).toBe(false); // 2 against a threshold of 2
  });

  it('never warns with a threshold of 0', () => {
    const none = firstAiderForecast({ ...input, threshold: 0 });
    expect(none.all.some((w) => w.belowThreshold)).toBe(false);
  });

  it('rises when a first aid certificate is approved', () => {
    const before = f.bySite[a.id]!.map((w) => w.count);
    const approved = evidenceExpiring(p1, aid, 500, {
      kind: 'external',
      approvedBy: 'u1',
      approvedAt: NOW.toISOString(),
    });
    const after = firstAiderForecast({ ...input, evidence: [...evidence, approved], threshold: 2 }).bySite[a.id]!.map(
      (w) => w.count,
    );
    expect(after[3]).toBe(2);
    expect(before[3]).toBe(1);
    expect(after.slice(0, 3)).toEqual(before.slice(0, 3));
  });

  it('adds a person who gains a certificate to the count from the week it is current', () => {
    const e = evidenceExpiring(p6, aid, 365);
    const r = firstAiderForecast({ ...input, evidence: [...evidence, e], threshold: 2 });
    expect(r.bySite[b.id]!.every((w) => w.count === 2)).toBe(true);
  });

  it('honours a different number of weeks', () => {
    expect(firstAiderForecast({ ...input, threshold: 2, weeks: 4 }).all).toHaveLength(4);
  });

  it('gives a site with nobody an all-zero row, not a missing one', () => {
    const empty = siteNamed('Empty');
    const r = firstAiderForecast({ ...input, sites: [a, b, empty], threshold: 1 });
    expect(r.bySite[empty.id]!.every((w) => w.count === 0 && w.belowThreshold)).toBe(true);
  });
});
