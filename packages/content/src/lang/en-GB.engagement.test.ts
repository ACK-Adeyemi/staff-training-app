// M2 chunk 5 (F-8): the new engagement key families exist in en-GB.json, with no payment wording for staff.
import { describe, expect, it } from 'vitest';
import enGB from './en-GB.json' with { type: 'json' };

const get = (key: string): unknown =>
  key.split('.').reduce<unknown>((n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined), enGB);

const flat = (n: unknown, p = ''): [string, string][] =>
  typeof n === 'string' ? [[p, n]] : n && typeof n === 'object' ? Object.entries(n).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k)) : [];
const all = flat(enGB);

const required = [
  'xp.title', 'xp.total', 'xp.today',
  'level.title', 'level.label', 'level.toNext',
  'badge.title', 'badge.earned', 'badge.locked',
  'weeklyGoal.title', 'weeklyGoal.met',
  'notes.title', 'notes.add', 'notes.save', 'notes.empty', 'notes.star', 'notes.lockedInQuiz',
  'compete.title',
  'competition.title', 'competition.prize', 'competition.prizeDisclaimer', 'competition.suggestPrize',
  'competition.clearPrize', 'competition.howToWin', 'competition.why',
  'leaderboard.title', 'leaderboard.you', 'leaderboard.hidden',
  'leaderboard.ordinal.one', 'leaderboard.ordinal.two', 'leaderboard.ordinal.few', 'leaderboard.ordinal.other',
  'organise.title', 'organise.moveUp', 'organise.moveDown',
  'display.title', 'display.simpleView', 'display.textSize', 'display.contrast', 'display.colourMode', 'display.spacing',
  'readAloud.title', 'readAloud.play', 'readAloud.stop',
  'me.title', 'me.nickname', 'me.hideFromLeaderboards',
  'celebration.levelUp', 'celebration.badge',
  'errors.rule.notesLocked', 'errors.rule.closedBook',
];

describe('en-GB engagement keys', () => {
  it.each(required)('has %s as a non-empty string', (key) => {
    const v = get(key);
    expect(typeof v, key).toBe('string');
    expect((v as string).trim().length).toBeGreaterThan(0);
  });

  it('has all eight competition templates with a name, how to win and why text', () => {
    const templates = get('competition.templates') as Record<string, Record<string, string>> | undefined;
    expect(templates && Object.keys(templates).length).toBe(8);
    for (const [id, t] of Object.entries(templates ?? {})) {
      for (const f of ['name', 'howToWin', 'why']) expect(typeof t[f], `${id}.${f}`).toBe('string');
    }
  });

  it('states the prize disclaimer from brief 13.3: client provides and pays, responsible for tax', () => {
    const text = String(get('competition.prizeDisclaimer'));
    expect(text).toMatch(/provide/i);
    expect(text).toMatch(/tax/i);
  });

  it('has no payment wording in staff-visible engagement strings', () => {
    const payment = /\b(pay|pays|paid|payment|price|invoice|billing|subscription|upgrade|refund|discount|charge)\b|[£$€]/i;
    const staff = all.filter(([k]) => /^(xp|level|badge|weeklyGoal|notes|leaderboard|display|readAloud|me|celebration)\./.test(k));
    expect(staff.length).toBeGreaterThan(20);
    expect(staff.filter(([, v]) => payment.test(v)).map(([k]) => k)).toEqual([]);
  });
});
