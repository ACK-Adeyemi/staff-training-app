// M2 chunk 1: schemas/engagement.ts (plan Design; assumptions 12, 13, 16, 21 to 24; build pack 6).
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_COLOURS,
  CATEGORY_ICONS,
  categorySchema,
  competitionSchema,
  moduleGroupSchema,
  modulePlacementSchema,
  noteSchema,
  standingBoardSettingsSchema,
  xpEntrySchema,
} from './engagement';
import * as schemas from './index';

const id = (n: number): string => `01HZX00000000000000000${String(n).padStart(4, '0')}`;
const at = '2026-10-19T09:00:00.000Z';
const later = '2026-11-19T09:00:00.000Z';

describe('engagement schemas are exported from the schemas index', () => {
  it('re-exports them', () => {
    for (const name of [
      'noteSchema',
      'categorySchema',
      'modulePlacementSchema',
      'moduleGroupSchema',
      'competitionSchema',
      'standingBoardSettingsSchema',
      'xpEntrySchema',
    ]) {
      expect((schemas as Record<string, unknown>)[name], name).toBeDefined();
    }
  });
});

describe('noteSchema', () => {
  const note = {
    id: id(1),
    clientId: id(2),
    personId: id(3),
    moduleId: id(4),
    lessonId: 'lesson-1',
    body: 'Ask the room leader about the sleep checks.',
    starred: false,
    createdAt: at,
    updatedAt: at,
  };

  it('accepts a note, with or without a lesson', () => {
    expect(noteSchema.safeParse(note).success).toBe(true);
    const { lessonId: _l, ...noLesson } = note;
    expect(noteSchema.safeParse(noLesson).success).toBe(true);
  });

  it('trims the body and refuses a body that is empty after trimming', () => {
    const r = noteSchema.safeParse({ ...note, body: '  hello  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.body).toBe('hello');
    expect(noteSchema.safeParse({ ...note, body: '   ' }).success).toBe(false);
    expect(noteSchema.safeParse({ ...note, body: '' }).success).toBe(false);
  });

  it('allows 1,000 characters and refuses 1,001', () => {
    expect(noteSchema.safeParse({ ...note, body: 'a'.repeat(1000) }).success).toBe(true);
    expect(noteSchema.safeParse({ ...note, body: 'a'.repeat(1001) }).success).toBe(false);
  });

  it('counts the trimmed length, not the raw length', () => {
    expect(noteSchema.safeParse({ ...note, body: ` ${'a'.repeat(1000)} ` }).success).toBe(true);
  });

  it.each(['clientId', 'personId', 'moduleId', 'starred', 'createdAt', 'updatedAt'])('requires %s', (key) => {
    const copy: Record<string, unknown> = { ...note };
    delete copy[key];
    expect(noteSchema.safeParse(copy).success).toBe(false);
  });
});

describe('categorySchema', () => {
  const category = {
    id: id(1),
    clientId: id(2),
    name: 'Safeguarding',
    colour: CATEGORY_COLOURS[0],
    icon: CATEGORY_ICONS[0],
    order: 0,
  };

  it('exports a fixed palette of 8 colour keys and a non-empty icon set', () => {
    expect(CATEGORY_COLOURS).toHaveLength(8);
    expect(new Set(CATEGORY_COLOURS).size).toBe(8);
    expect(CATEGORY_ICONS.length).toBeGreaterThan(0);
    expect(new Set(CATEGORY_ICONS).size).toBe(CATEGORY_ICONS.length);
  });

  it('accepts every palette colour and every icon', () => {
    for (const colour of CATEGORY_COLOURS) expect(categorySchema.safeParse({ ...category, colour }).success).toBe(true);
    for (const icon of CATEGORY_ICONS) expect(categorySchema.safeParse({ ...category, icon }).success).toBe(true);
  });

  it('refuses a colour or icon outside the fixed sets', () => {
    expect(categorySchema.safeParse({ ...category, colour: '#ff00ff' }).success).toBe(false);
    expect(categorySchema.safeParse({ ...category, icon: 'not-an-icon' }).success).toBe(false);
  });

  it('requires clientId (categories are per client)', () => {
    const { clientId: _c, ...bad } = category;
    expect(categorySchema.safeParse(bad).success).toBe(false);
  });

  it('needs a whole, non-negative order', () => {
    expect(categorySchema.safeParse({ ...category, order: -1 }).success).toBe(false);
    expect(categorySchema.safeParse({ ...category, order: 1.5 }).success).toBe(false);
    expect(categorySchema.safeParse({ ...category, order: 5 }).success).toBe(true);
  });

  it('limits the name to 1 to 40 characters', () => {
    expect(categorySchema.safeParse({ ...category, name: '' }).success).toBe(false);
    expect(categorySchema.safeParse({ ...category, name: 'a'.repeat(40) }).success).toBe(true);
    expect(categorySchema.safeParse({ ...category, name: 'a'.repeat(41) }).success).toBe(false);
  });
});

describe('modulePlacementSchema', () => {
  const placement = { clientId: id(1), moduleId: id(2), categoryId: id(3), availableToAll: true };

  it('accepts a placement with or without a category', () => {
    expect(modulePlacementSchema.safeParse(placement).success).toBe(true);
    const { categoryId: _c, ...none } = placement;
    expect(modulePlacementSchema.safeParse(none).success).toBe(true);
  });

  it('accepts the review stamp from build pack 6 and requires clientId and availableToAll', () => {
    const reviewed = { ...placement, reviewedByOrg: { by: id(4), at, version: 2 } };
    expect(modulePlacementSchema.safeParse(reviewed).success).toBe(true);
    const { clientId: _c, ...noClient } = placement;
    expect(modulePlacementSchema.safeParse(noClient).success).toBe(false);
    const { availableToAll: _a, ...noFlag } = placement;
    expect(modulePlacementSchema.safeParse(noFlag).success).toBe(false);
  });
});

describe('moduleGroupSchema', () => {
  const group = {
    id: id(1),
    clientId: id(2),
    name: 'New starter induction',
    description: 'First weeks',
    moduleIds: [id(3), id(4)],
    inOrder: true,
  };

  it('accepts a group, with an optional siteId', () => {
    expect(moduleGroupSchema.safeParse(group).success).toBe(true);
    expect(moduleGroupSchema.safeParse({ ...group, siteId: id(5) }).success).toBe(true);
  });

  it('refuses an empty module list and more than 30 modules', () => {
    expect(moduleGroupSchema.safeParse({ ...group, moduleIds: [] }).success).toBe(false);
    const thirty = Array.from({ length: 30 }, (_, i) => id(100 + i));
    expect(moduleGroupSchema.safeParse({ ...group, moduleIds: thirty }).success).toBe(true);
    expect(moduleGroupSchema.safeParse({ ...group, moduleIds: [...thirty, id(200)] }).success).toBe(false);
  });

  it('refuses the same module twice', () => {
    expect(moduleGroupSchema.safeParse({ ...group, moduleIds: [id(3), id(3)] }).success).toBe(false);
  });

  it('requires clientId', () => {
    const { clientId: _c, ...bad } = group;
    expect(moduleGroupSchema.safeParse(bad).success).toBe(false);
  });
});

describe('competitionSchema', () => {
  const builtIn = {
    id: id(1),
    clientId: id(2),
    type: 'builtIn',
    templateId: 'knowledgeBuilder',
    name: 'Autumn Knowledge Builder',
    startAt: at,
    endAt: later,
    prizeText: 'A box of biscuits for the room',
    eligibility: { excludePersonIds: [] },
    winnerSelection: 'top',
    winnerCount: 3,
    liveLeaderboard: true,
    status: 'scheduled',
  };
  const custom = {
    id: id(1),
    clientId: id(2),
    type: 'custom',
    name: 'Best room display',
    startAt: at,
    endAt: later,
    prizeText: 'A plant',
    eligibility: { excludePersonIds: [] },
    status: 'scheduled',
  };
  const ok = (c: object) => competitionSchema.safeParse(c).success;

  it('accepts a built-in and a custom competition', () => {
    expect(ok(builtIn)).toBe(true);
    expect(ok(custom)).toBe(true);
  });

  it('accepts all eight template ids', () => {
    const templates: Record<string, object> = {
      masteryMonth: { winnerSelection: 'top' },
      knowledgeBuilder: { winnerSelection: 'top' },
      learningStreak: { winnerSelection: 'draw' },
      teamShowdown: { winnerSelection: 'teamTarget', teamTarget: 90, teamUnit: 'team' },
      beatTheExpiry: { winnerSelection: 'draw' },
      completeAndWin: { winnerSelection: 'draw', moduleIds: [id(9)] },
      scenarioSavvy: { winnerSelection: 'top' },
      closedBookChallenge: { winnerSelection: 'top', closedBookOnly: true },
    };
    for (const [templateId, extra] of Object.entries(templates)) {
      expect(ok({ ...builtIn, templateId, ...extra }), templateId).toBe(true);
    }
  });

  it('allows stored status draft, scheduled and cancelled only (status is derived otherwise)', () => {
    for (const status of ['draft', 'scheduled', 'cancelled']) expect(ok({ ...builtIn, status })).toBe(true);
    for (const status of ['live', 'ended']) expect(ok({ ...builtIn, status })).toBe(false);
  });

  it('keeps winners and finalStandings, and accepts teamUnit and teamTarget', () => {
    const withWinners = {
      ...builtIn,
      winners: [{ personId: id(7), recordedAt: later }],
      finalStandings: { rows: [] },
    };
    expect(ok(withWinners)).toBe(true);
    expect(ok({ ...builtIn, teamUnit: 'site', teamTarget: 50 })).toBe(true);
    expect(ok({ ...builtIn, teamUnit: 'region' })).toBe(false);
  });

  it('needs a template on a built-in competition', () => {
    const { templateId: _t, ...noTemplate } = builtIn;
    expect(ok(noTemplate)).toBe(false);
    expect(ok({ ...builtIn, templateId: 'madeUp' })).toBe(false);
  });

  it('needs winner selection on a built-in competition', () => {
    const { winnerSelection: _w, ...none } = builtIn;
    expect(ok(none)).toBe(false);
  });

  it.each([
    ['a template', { templateId: 'knowledgeBuilder' }],
    ['winner selection', { winnerSelection: 'top' }],
    ['a live leaderboard', { liveLeaderboard: true }],
    ['closed-book only', { closedBookOnly: true }],
    ['module ids', { moduleIds: [id(9)] }],
  ])('refuses a custom competition with %s', (_n, extra) => {
    expect(ok({ ...custom, ...extra })).toBe(false);
  });

  it('needs moduleIds for completeAndWin', () => {
    const cw = { ...builtIn, templateId: 'completeAndWin', winnerSelection: 'draw' };
    expect(ok(cw)).toBe(false);
    expect(ok({ ...cw, moduleIds: [] })).toBe(false);
    expect(ok({ ...cw, moduleIds: [id(9)] })).toBe(true);
  });

  it('forces closedBookOnly on for closedBookChallenge', () => {
    const cb = { ...builtIn, templateId: 'closedBookChallenge' };
    expect(ok(cb)).toBe(false);
    expect(ok({ ...cb, closedBookOnly: false })).toBe(false);
    expect(ok({ ...cb, closedBookOnly: true })).toBe(true);
  });

  it('allows closedBookOnly only on masteryMonth, knowledgeBuilder, scenarioSavvy and closedBookChallenge', () => {
    for (const templateId of ['masteryMonth', 'knowledgeBuilder', 'scenarioSavvy']) {
      expect(ok({ ...builtIn, templateId, closedBookOnly: true }), templateId).toBe(true);
    }
    expect(ok({ ...builtIn, templateId: 'learningStreak', winnerSelection: 'draw', closedBookOnly: true })).toBe(false);
    expect(ok({ ...builtIn, templateId: 'beatTheExpiry', winnerSelection: 'draw', closedBookOnly: true })).toBe(false);
    expect(
      ok({ ...builtIn, templateId: 'teamShowdown', winnerSelection: 'teamTarget', closedBookOnly: true }),
    ).toBe(false);
    expect(
      ok({ ...builtIn, templateId: 'completeAndWin', winnerSelection: 'draw', moduleIds: [id(9)], closedBookOnly: true }),
    ).toBe(false);
  });

  it('limits winnerCount to 1 to 20', () => {
    expect(ok({ ...builtIn, winnerCount: 0 })).toBe(false);
    expect(ok({ ...builtIn, winnerCount: 1 })).toBe(true);
    expect(ok({ ...builtIn, winnerCount: 20 })).toBe(true);
    expect(ok({ ...builtIn, winnerCount: 21 })).toBe(false);
    expect(ok({ ...builtIn, winnerCount: 2.5 })).toBe(false);
  });

  it('limits teamTarget to 1 to 100', () => {
    const t = { ...builtIn, templateId: 'teamShowdown', winnerSelection: 'teamTarget' };
    expect(ok({ ...t, teamTarget: 0 })).toBe(false);
    expect(ok({ ...t, teamTarget: 1 })).toBe(true);
    expect(ok({ ...t, teamTarget: 100 })).toBe(true);
    expect(ok({ ...t, teamTarget: 101 })).toBe(false);
  });

  it('requires clientId and an eligibility block with excludePersonIds', () => {
    const { clientId: _c, ...noClient } = builtIn;
    expect(ok(noClient)).toBe(false);
    expect(ok({ ...builtIn, eligibility: {} })).toBe(false);
  });
});

describe('standingBoardSettingsSchema', () => {
  const settings = {
    clientId: id(1),
    boards: {
      correctQuestions: { enabled: true, staffScopes: ['site'] },
      teamBoard: { enabled: false, staffScopes: ['site', 'region'] },
    },
    siteBoard: {
      enabled: false,
      measures: ['compliance', 'onTime'],
      staffScopes: ['site'],
      smallSiteMinActive: 5,
      newStarterGraceDays: 30,
      excludedSiteIds: [],
    },
  };

  it('accepts settings keyed by the six board ids', () => {
    const boards = Object.fromEntries(
      ['correctQuestions', 'modulesCompleted', 'modulesMastered', 'activeWeeks', 'refresherChampions', 'teamBoard'].map(
        (b) => [b, { enabled: true, staffScopes: ['site'] }],
      ),
    );
    expect(standingBoardSettingsSchema.safeParse({ ...settings, boards }).success).toBe(true);
  });

  it('refuses an unknown board id and an unknown scope', () => {
    expect(
      standingBoardSettingsSchema.safeParse({ ...settings, boards: { speedBoard: { enabled: true, staffScopes: ['site'] } } })
        .success,
    ).toBe(false);
    expect(
      standingBoardSettingsSchema.safeParse({
        ...settings,
        boards: { correctQuestions: { enabled: true, staffScopes: ['planet'] } },
      }).success,
    ).toBe(false);
  });

  it('accepts the four leaderboard scopes', () => {
    const boards = { correctQuestions: { enabled: true, staffScopes: ['site', 'region', 'country', 'all'] } };
    expect(standingBoardSettingsSchema.safeParse({ ...settings, boards }).success).toBe(true);
  });

  it('gives siteBoard defaults when it is omitted', () => {
    const { siteBoard: _s, ...rest } = settings;
    const r = standingBoardSettingsSchema.safeParse(rest);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.siteBoard.excludedSiteIds).toEqual([]);
      expect(r.data.siteBoard.staffScopes).toEqual(['site']);
      expect(r.data.siteBoard.smallSiteMinActive).toBeGreaterThan(0);
      expect(r.data.siteBoard.enabled).toBe(false);
    }
  });

  it('requires clientId', () => {
    const { clientId: _c, ...bad } = settings;
    expect(standingBoardSettingsSchema.safeParse(bad).success).toBe(false);
  });
});

describe('xpEntrySchema', () => {
  const entry = { id: id(1), personId: id(2), kind: 'correct', amount: 10, sourceEventId: id(3), at };

  it.each(['lesson', 'correct', 'closedBookBonus', 'passed', 'mastery', 'earlyRefresher', 'weeklyGoal', 'battle'])(
    'accepts kind %s',
    (kind) => {
      expect(xpEntrySchema.safeParse({ ...entry, kind }).success).toBe(true);
    },
  );

  it('refuses an unknown kind, and speed-style kinds in particular', () => {
    expect(xpEntrySchema.safeParse({ ...entry, kind: 'speedBonus' }).success).toBe(false);
  });

  it('accepts the optional capped flag and a zero amount', () => {
    expect(xpEntrySchema.safeParse({ ...entry, amount: 0, capped: true }).success).toBe(true);
  });

  it('refuses a negative amount', () => {
    expect(xpEntrySchema.safeParse({ ...entry, amount: -5 }).success).toBe(false);
  });
});
