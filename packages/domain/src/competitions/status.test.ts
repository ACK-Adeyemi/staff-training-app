// F-5 and BP-4 (pure parts): derived status, eligibility and when the closed-book choice applies (plan M2 assumptions 12, 14, 19).
import { describe, expect, it } from 'vitest';
import { closedBookChoiceApplies, competitionStatus, isEligible } from './status';
import { competition, customCompetition, nextId, staff } from './testFixtures';

const c = competition({ startAt: '2026-10-10T09:00:00.000Z', endAt: '2026-10-20T09:00:00.000Z' });
const at = (iso: string) => new Date(iso);

describe('competitionStatus', () => {
  it('is scheduled before startAt', () => {
    expect(competitionStatus(c, at('2026-10-10T08:59:59.999Z'))).toBe('scheduled');
  });
  it('is live from the start instant', () => {
    expect(competitionStatus(c, at('2026-10-10T09:00:00.000Z'))).toBe('live');
  });
  it('is live during the window', () => {
    expect(competitionStatus(c, at('2026-10-15T09:00:00.000Z'))).toBe('live');
    expect(competitionStatus(c, at('2026-10-20T08:59:59.999Z'))).toBe('live');
  });
  it('is ended from the end instant on', () => {
    expect(competitionStatus(c, at('2026-10-20T09:00:00.000Z'))).toBe('ended');
    expect(competitionStatus(c, at('2027-01-01T00:00:00.000Z'))).toBe('ended');
  });
  it('stays draft whatever the dates say', () => {
    expect(competitionStatus({ ...c, status: 'draft' }, at('2026-10-15T09:00:00.000Z'))).toBe('draft');
  });
  it('stays cancelled whatever the dates say', () => {
    const cancelled = { ...c, status: 'cancelled' as const };
    expect(competitionStatus(cancelled, at('2026-10-15T09:00:00.000Z'))).toBe('cancelled');
    expect(competitionStatus(cancelled, at('2026-12-15T09:00:00.000Z'))).toBe('cancelled');
  });
  it('moves on when the clock moves (Fast-forward)', () => {
    expect(competitionStatus(c, at('2026-10-01T09:00:00.000Z'))).toBe('scheduled');
    expect(competitionStatus(c, at('2026-10-08T09:00:00.000Z'))).toBe('scheduled');
    expect(competitionStatus(c, at('2026-10-11T09:00:00.000Z'))).toBe('live');
  });
  it('works for custom competitions too', () => {
    expect(
      competitionStatus(customCompetition({ startAt: c.startAt, endAt: c.endAt }), at('2026-10-15T09:00:00.000Z')),
    ).toBe('live');
  });
});

describe('isEligible', () => {
  const role = nextId();
  const team = nextId();
  const site = nextId();
  const p = staff('Pat', 'Jones', { jobRoleIds: [role], teamIds: [team] });

  it('includes every active person when no list is set', () => {
    expect(isEligible(competition(), p)).toBe(true);
  });
  it('never includes people on leave, invited or archived', () => {
    for (const status of ['onLeave', 'invited', 'archived'] as const) {
      expect(isEligible(competition(), staff('A', 'B', { status }))).toBe(false);
    }
  });
  it('narrows by job role when roles are listed', () => {
    expect(isEligible(competition({ eligibility: { jobRoleIds: [role], excludePersonIds: [] } }), p)).toBe(true);
    expect(isEligible(competition({ eligibility: { jobRoleIds: [nextId()], excludePersonIds: [] } }), p)).toBe(false);
  });
  it("narrows by team and matches if any of the person's teams is listed", () => {
    const two = staff('Two', 'Teams', { teamIds: [nextId(), team] });
    expect(isEligible(competition({ eligibility: { teamIds: [team], excludePersonIds: [] } }), two)).toBe(true);
    expect(isEligible(competition({ eligibility: { teamIds: [nextId()], excludePersonIds: [] } }), two)).toBe(false);
  });
  it('narrows by site, counting additional sites', () => {
    const multi = staff('Multi', 'Site', { additionalSiteIds: [site] });
    expect(isEligible(competition({ eligibility: { siteIds: [site], excludePersonIds: [] } }), multi)).toBe(true);
    expect(isEligible(competition({ eligibility: { siteIds: [nextId()], excludePersonIds: [] } }), multi)).toBe(false);
  });
  it('needs every set list to match', () => {
    const c2 = competition({ eligibility: { jobRoleIds: [role], teamIds: [nextId()], excludePersonIds: [] } });
    expect(isEligible(c2, p)).toBe(false);
  });
  it('removes named exclusions even when everything else matches', () => {
    expect(isEligible(competition({ eligibility: { excludePersonIds: [p.id] } }), p)).toBe(false);
  });
});

describe('closedBookChoiceApplies', () => {
  const now = at('2026-10-15T09:00:00.000Z');
  const moduleId = nextId();
  const p = staff('Cb', 'Person');
  const live = (over = {}) =>
    competition({
      templateId: 'closedBookChallenge',
      closedBookOnly: true,
      startAt: '2026-10-10T09:00:00.000Z',
      endAt: '2026-10-20T09:00:00.000Z',
      ...over,
    });

  it('is true for a live, eligible, closed-book competition covering all modules', () => {
    expect(closedBookChoiceApplies([live()], p, moduleId, now)).toBe(true);
  });
  it('is true when moduleIds includes the module and false when it does not', () => {
    expect(closedBookChoiceApplies([live({ moduleIds: [moduleId] })], p, moduleId, now)).toBe(true);
    expect(closedBookChoiceApplies([live({ moduleIds: [nextId()] })], p, moduleId, now)).toBe(false);
  });
  it('is false when the competition is not closed-book only', () => {
    expect(
      closedBookChoiceApplies(
        [competition({ startAt: '2026-10-10T09:00:00.000Z', endAt: '2026-10-20T09:00:00.000Z' })],
        p,
        moduleId,
        now,
      ),
    ).toBe(false);
  });
  it('is false for scheduled, ended, draft and cancelled competitions', () => {
    expect(closedBookChoiceApplies([live({ startAt: '2026-10-16T09:00:00.000Z' })], p, moduleId, now)).toBe(false);
    expect(closedBookChoiceApplies([live({ endAt: '2026-10-15T09:00:00.000Z' })], p, moduleId, now)).toBe(false);
    expect(closedBookChoiceApplies([live({ status: 'draft' })], p, moduleId, now)).toBe(false);
    expect(closedBookChoiceApplies([live({ status: 'cancelled' })], p, moduleId, now)).toBe(false);
  });
  it('is false when the person is not eligible', () => {
    expect(closedBookChoiceApplies([live({ eligibility: { excludePersonIds: [p.id] } })], p, moduleId, now)).toBe(
      false,
    );
  });
  it('is true if any one of several competitions qualifies, false for none, and ignores custom ones', () => {
    expect(closedBookChoiceApplies([customCompetition(), live()], p, moduleId, now)).toBe(true);
    expect(closedBookChoiceApplies([customCompetition()], p, moduleId, now)).toBe(false);
    expect(closedBookChoiceApplies([], p, moduleId, now)).toBe(false);
  });
});
