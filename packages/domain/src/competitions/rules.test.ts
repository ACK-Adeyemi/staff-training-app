// F-5 (pure parts): builder rules from plan M2 assumption 16. validateCompetition returns the broken rule names
// (empty when valid). Entitlement and limit checks belong to the data layer.
import { describe, expect, it } from 'vitest';
import { validateCompetition } from './rules';
import { competition, customCompetition, nextId } from './testFixtures';

const NOW = new Date('2026-10-15T09:00:00.000Z');
const FUTURE = { startAt: '2026-11-01T00:00:00.000Z', endAt: '2026-11-30T00:00:00.000Z' };
const LIVE = { startAt: '2026-10-10T00:00:00.000Z', endAt: '2026-10-31T00:00:00.000Z' };
const rules = (before: Parameters<typeof validateCompetition>[0], after: Parameters<typeof validateCompetition>[1]) =>
  validateCompetition(before, after, NOW);

describe('a new competition', () => {
  it('is valid for a complete built-in competition', () => {
    expect(rules(undefined, competition(FUTURE))).toEqual([]);
  });
  it('is valid for a complete custom competition', () => {
    expect(rules(undefined, customCompetition(FUTURE))).toEqual([]);
  });
  it('needs the end after the start', () => {
    expect(rules(undefined, competition({ ...FUTURE, endAt: FUTURE.startAt }))).toContain('endBeforeStart');
    expect(rules(undefined, competition({ ...FUTURE, endAt: '2026-10-01T00:00:00.000Z' }))).toContain('endBeforeStart');
  });
  it('needs a template and a winner selection when built in', () => {
    expect(rules(undefined, { ...competition(FUTURE), templateId: undefined })).toContain('invalidCompetition');
    expect(rules(undefined, { ...competition(FUTURE), winnerSelection: undefined })).toContain('invalidCompetition');
  });
  it('gives a custom competition no template, metric, leaderboard, winner selection or closed-book option', () => {
    for (const extra of [
      { templateId: 'knowledgeBuilder' },
      { winnerSelection: 'top' },
      { liveLeaderboard: true },
      { closedBookOnly: true },
      { moduleIds: [nextId()] },
    ]) {
      expect(rules(undefined, { ...customCompetition(FUTURE), ...extra } as never)).toContain('invalidCompetition');
    }
  });
  it('keeps the name to 1 to 80 characters', () => {
    expect(rules(undefined, competition({ ...FUTURE, name: '' }))).toContain('invalidCompetition');
    expect(rules(undefined, competition({ ...FUTURE, name: 'x'.repeat(81) }))).toContain('invalidCompetition');
    expect(rules(undefined, competition({ ...FUTURE, name: 'x'.repeat(80) }))).toEqual([]);
    expect(rules(undefined, competition({ ...FUTURE, name: 'x' }))).toEqual([]);
  });
  it('keeps the description to 500 characters', () => {
    expect(rules(undefined, competition({ ...FUTURE, description: 'x'.repeat(501) }))).toContain('invalidCompetition');
    expect(rules(undefined, competition({ ...FUTURE, description: 'x'.repeat(500) }))).toEqual([]);
  });
});

describe('the prize', () => {
  it('is required to publish, at 1 to 120 characters', () => {
    expect(rules(undefined, competition({ ...FUTURE, prizeText: '' }))).toContain('prizeRequired');
    expect(rules(undefined, competition({ ...FUTURE, prizeText: '   ' }))).toContain('prizeRequired');
    expect(rules(undefined, competition({ ...FUTURE, prizeText: 'x'.repeat(120) }))).toEqual([]);
    expect(rules(undefined, competition({ ...FUTURE, prizeText: 'x'.repeat(121) }))).toContain('invalidCompetition');
  });
  it('may be empty in a draft but not over the length limit', () => {
    expect(rules(undefined, competition({ ...FUTURE, prizeText: '', status: 'draft' }))).toEqual([]);
    expect(rules(undefined, competition({ ...FUTURE, prizeText: 'x'.repeat(121), status: 'draft' }))).toContain(
      'invalidCompetition',
    );
  });
  it('is required for custom competitions too', () => {
    expect(rules(undefined, customCompetition({ ...FUTURE, prizeText: '' }))).toContain('prizeRequired');
  });
});

describe('editing a competition that has not started', () => {
  const before = competition(FUTURE);
  it('allows changing the template, closed-book setting, modules, team unit, eligibility and dates', () => {
    const after = {
      ...before,
      templateId: 'scenarioSavvy' as const,
      closedBookOnly: true,
      moduleIds: [nextId()],
      teamUnit: 'site' as const,
      eligibility: { teamIds: [nextId()], excludePersonIds: [] },
      endAt: '2026-11-20T00:00:00.000Z',
    };
    expect(rules(before, after)).toEqual([]);
  });
  it('allows the end to move earlier while it has not started', () => {
    expect(rules(before, { ...before, endAt: '2026-11-10T00:00:00.000Z' })).toEqual([]);
  });
});

describe('editing a competition that has started', () => {
  const before = competition({ ...LIVE, moduleIds: [nextId()] });

  it('allows name, description, prize, winner settings and leaderboard changes', () => {
    expect(
      rules(before, {
        ...before,
        name: 'New name',
        description: 'More',
        prizeText: 'Other prize',
        winnerCount: 5,
        liveLeaderboard: false,
      }),
    ).toEqual([]);
  });
  it.each([
    ['template', { templateId: 'masteryMonth' as const }],
    ['closedBookOnly', { closedBookOnly: true }],
    ['moduleIds', { moduleIds: [nextId()] }],
    ['teamUnit', { teamUnit: 'site' as const }],
    ['eligibility', { eligibility: { jobRoleIds: [nextId()], excludePersonIds: [] } }],
  ])('locks the %s with metricLocked', (_name, change) => {
    expect(rules(before, { ...before, ...change })).toContain('metricLocked');
  });
  it('locks eligibility changes to named exclusions as well', () => {
    expect(rules(before, { ...before, eligibility: { excludePersonIds: [nextId()] } })).toContain('metricLocked');
  });
  it('lets the end move later', () => {
    expect(rules(before, { ...before, endAt: '2026-11-15T00:00:00.000Z' })).toEqual([]);
  });
  it('refuses to shorten the end', () => {
    expect(rules(before, { ...before, endAt: '2026-10-20T00:00:00.000Z' })).toContain('endShortened');
  });
  it('allows cancelling before the end', () => {
    expect(rules(before, { ...before, status: 'cancelled' })).toEqual([]);
  });
});

describe('ended and cancelled competitions', () => {
  it('cannot be edited once ended', () => {
    const ended = competition({ startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-10-01T00:00:00.000Z' });
    expect(rules(ended, { ...ended, name: 'Renamed' })).toContain('competitionEnded');
  });
  it('cannot be cancelled once ended', () => {
    const ended = competition({ startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-10-01T00:00:00.000Z' });
    expect(rules(ended, { ...ended, status: 'cancelled' })).toContain('competitionEnded');
  });
  it('cannot have its end extended once ended', () => {
    const ended = competition({ startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-10-01T00:00:00.000Z' });
    expect(rules(ended, { ...ended, endAt: '2026-12-01T00:00:00.000Z' })).toContain('competitionEnded');
  });
  it('cannot be edited once cancelled', () => {
    const cancelled = competition({ ...FUTURE, status: 'cancelled' });
    expect(rules(cancelled, { ...cancelled, name: 'Renamed' })).toContain('competitionCancelled');
  });
});

describe('closed-book and template combinations', () => {
  it('lets closed-book only be on for the four templates that allow it', () => {
    for (const templateId of ['masteryMonth', 'knowledgeBuilder', 'scenarioSavvy', 'closedBookChallenge'] as const) {
      expect(rules(undefined, competition({ ...FUTURE, templateId, closedBookOnly: true }))).toEqual([]);
    }
  });
  it.each(['learningStreak', 'teamShowdown', 'beatTheExpiry'] as const)(
    'refuses closed-book only on %s',
    (templateId) => {
      expect(rules(undefined, competition({ ...FUTURE, templateId, closedBookOnly: true }))).toContain(
        'invalidCompetition',
      );
    },
  );
  it('needs modules for Complete and Win', () => {
    const base = { ...FUTURE, templateId: 'completeAndWin' as const, winnerSelection: 'draw' as const };
    expect(rules(undefined, competition(base))).toContain('invalidCompetition');
    expect(rules(undefined, competition({ ...base, moduleIds: [nextId()] }))).toEqual([]);
  });
  it('forces closed-book on for the Closed-Book Challenge', () => {
    expect(
      rules(undefined, competition({ ...FUTURE, templateId: 'closedBookChallenge', closedBookOnly: false })),
    ).toContain('invalidCompetition');
  });
});
