// M2 chunk 1: preference, client setting, demo state, attempt and event schema changes
// (plan Design "Domain package"; conflict 2 and 12; assumptions 4, 7, 20, 29).
import { describe, expect, it } from 'vitest';
import {
  attemptSchema,
  clientSettingsSchema,
  demoStateSchema,
  learnerPrefsSchema,
  learningEventSchema,
  personSchema,
} from './index';

const id = (n: number): string => `01HZX00000000000000000${String(n).padStart(4, '0')}`;
const at = '2026-10-19T09:00:00.000Z';

const oldPrefs = {
  hideFromLeaderboards: false,
  simpleView: false,
  textScale: 1,
  uiScale: 1,
  contrast: 'standard',
  colourMode: 'auto',
  reduceMotion: false,
  sound: false,
  haptics: true,
  readingFont: 'default',
  biggerButtons: false,
  language: 'en-GB',
  battleExtraTimePercent: 0,
};

describe('learnerPrefsSchema additions', () => {
  it('fills spacing, readAloud and readAloudRate with their defaults', () => {
    const parsed = learnerPrefsSchema.parse(oldPrefs);
    expect(parsed.spacing).toBe('standard');
    expect(parsed.readAloud).toBe(true);
    expect(parsed.readAloudRate).toBe(1);
  });

  it('accepts wide spacing and each allowed read-aloud rate', () => {
    for (const readAloudRate of [0.75, 1, 1.25, 1.5]) {
      const r = learnerPrefsSchema.safeParse({ ...oldPrefs, spacing: 'wide', readAloud: false, readAloudRate });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.readAloudRate).toBe(readAloudRate);
    }
  });

  it.each([
    ['spacing', { spacing: 'huge' }],
    ['read-aloud rate 2', { readAloudRate: 2 }],
    ['read-aloud rate 0.5', { readAloudRate: 0.5 }],
    ['readAloud as text', { readAloud: 'yes' }],
  ])('refuses a bad %s', (_name, patch) => {
    expect(learnerPrefsSchema.safeParse({ ...oldPrefs, ...patch }).success).toBe(false);
  });
});

describe('clientSettingsSchema.weeklyGoalLessons', () => {
  it('defaults to 1', () => {
    expect(clientSettingsSchema.parse({}).weeklyGoalLessons).toBe(1);
  });

  it.each([1, 4, 7])('accepts %i', (n) => {
    expect(clientSettingsSchema.safeParse({ weeklyGoalLessons: n }).success).toBe(true);
  });

  it.each([0, 8, 2.5, -1])('refuses %s', (n) => {
    expect(clientSettingsSchema.safeParse({ weeklyGoalLessons: n }).success).toBe(false);
  });
});

describe('person nickname', () => {
  const person = {
    id: id(1),
    clientId: id(2),
    primarySiteId: id(3),
    additionalSiteIds: [],
    teamIds: [],
    firstName: 'Jade',
    lastName: 'Morgan',
    jobRoleIds: [],
    startDate: at,
    status: 'active',
    prefs: oldPrefs,
  };

  it('accepts letters, digits, spaces, hyphens and apostrophes', () => {
    for (const nickname of ['Jay', "O'Neil", 'Mary-Jane', 'Sam 2', 'Zoë']) {
      expect(personSchema.safeParse({ ...person, nickname }).success).toBe(true);
    }
  });

  it('trims surrounding spaces', () => {
    const r = personSchema.safeParse({ ...person, nickname: '  Jay  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.nickname).toBe('Jay');
  });

  it.each([
    ['empty', ''],
    ['31 characters', 'a'.repeat(31)],
    ['angle brackets', '<b>Jay</b>'],
    ['an emoji', 'Jay 😀'],
    ['starts with a hyphen', '-Jay'],
    ['only spaces', '   '],
  ])('refuses a nickname that is %s', (_n, nickname) => {
    expect(personSchema.safeParse({ ...person, nickname }).success).toBe(false);
  });

  it('accepts exactly 30 characters', () => {
    expect(personSchema.safeParse({ ...person, nickname: 'a'.repeat(30) }).success).toBe(true);
  });
});

describe('demoStateSchema.displayPrefs', () => {
  const state = { clockOffsetMs: 0, industry: 'nursery', persona: { side: 'client', userId: id(1) } };

  it('stays valid without displayPrefs', () => {
    expect(demoStateSchema.safeParse(state).success).toBe(true);
  });

  it('accepts the display subset of learner prefs', () => {
    const displayPrefs = { simpleView: true, textScale: 1.5, contrast: 'high', colourMode: 'dark', spacing: 'wide' };
    const r = demoStateSchema.safeParse({ ...state, displayPrefs });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.displayPrefs).toMatchObject(displayPrefs);
  });

  it('refuses an invalid display value', () => {
    expect(demoStateSchema.safeParse({ ...state, displayPrefs: { contrast: 'extreme' } }).success).toBe(false);
  });

  it('does not carry non-display prefs such as leaderboard hiding', () => {
    const r = demoStateSchema.safeParse({ ...state, displayPrefs: { hideFromLeaderboards: true } });
    expect(r.success ? (r.data.displayPrefs as Record<string, unknown>)['hideFromLeaderboards'] : undefined).toBeUndefined();
  });
});

describe('attemptSchema.abandoned', () => {
  const attempt = {
    id: id(1),
    clientId: id(2),
    siteId: id(3),
    personId: id(4),
    moduleId: id(5),
    moduleVersion: 1,
    mode: 'closed',
    questionIds: ['q1'],
    startedAt: at,
  };

  it('accepts abandoned true and false and keeps the flag', () => {
    for (const abandoned of [true, false]) {
      const r = attemptSchema.safeParse({ ...attempt, abandoned });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.abandoned).toBe(abandoned);
    }
  });

  it('stays valid without the flag and refuses a non-boolean', () => {
    expect(attemptSchema.safeParse(attempt).success).toBe(true);
    expect(attemptSchema.safeParse({ ...attempt, abandoned: 'yes' }).success).toBe(false);
  });
});

describe('questionAnswered events need notesVisible', () => {
  const answered = {
    id: id(1),
    clientId: id(2),
    siteId: id(3),
    personId: id(4),
    at,
    type: 'questionAnswered',
    moduleId: id(5),
    attemptId: id(6),
    questionId: 'q1',
    correct: true,
  };

  it('refuses a questionAnswered event without notesVisible', () => {
    expect(learningEventSchema.safeParse(answered).success).toBe(false);
  });

  it('accepts notesVisible true or false', () => {
    expect(learningEventSchema.safeParse({ ...answered, notesVisible: false }).success).toBe(true);
    expect(learningEventSchema.safeParse({ ...answered, notesVisible: true }).success).toBe(true);
  });

  it('does not require notesVisible on other event types', () => {
    const lesson = { ...answered, type: 'lessonCompleted' };
    delete (lesson as Record<string, unknown>)['questionId'];
    delete (lesson as Record<string, unknown>)['correct'];
    expect(learningEventSchema.safeParse(lesson).success).toBe(true);
    expect(learningEventSchema.safeParse({ ...answered, type: 'learnMoreOpened' }).success).toBe(true);
  });
});
