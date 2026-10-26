// M3 chunk 5 (F-3, F-4, BP-16): support features, issue types, feedback tags, FAQs and release notes.
// Contract (all keys are en-GB.json message keys, no literal UI text):
//   support/features.ts     export supportFeatures: { id; labelKey; iconKey; area }[]
//   support/issueTypes.ts   export issueTypes: { id; labelKey }[]
//   support/feedbackTags.ts export feedbackTags: { id; labelKey }[]   (ids include 'unclear' and 'mistakeInQuestion')
//   support/faqs.ts         export faqs: { id; audience: 'staff' | 'client'; categoryKey; questionKey; answerKey }[]
//   support/releaseNotes.ts export releaseNotes: { id; date (YYYY-MM-DD); titleKey; bodyKey }[]   (newest first)
import { describe, expect, it } from 'vitest';
import enGB from '../lang/en-GB.json';
import { supportFeatures } from './features';
import { issueTypes } from './issueTypes';
import { feedbackTags } from './feedbackTags';
import { faqs } from './faqs';
import { releaseNotes } from './releaseNotes';

const lookup = (key: string): string | undefined => {
  const v = key
    .split('.')
    .reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), enGB);
  return typeof v === 'string' ? v : undefined;
};
const text = (key: string): string => lookup(key) ?? '';
const unique = (ids: string[]): boolean => new Set(ids).size === ids.length;
const PAYMENT =
  /\b(pay|pays|paid|payment|payments|price|prices|pricing|invoice|invoices|billing|bill|subscription|card|plan|package|tier|upgrade|downgrade|trial|fee|fees|cost|costs|refund|discount|charge|charged)\b|[£$€]/i;

describe('support features', () => {
  it('has about 15 features with unique ids', () => {
    expect(supportFeatures.length).toBeGreaterThanOrEqual(13);
    expect(supportFeatures.length).toBeLessThanOrEqual(18);
    expect(unique(supportFeatures.map((f) => f.id))).toBe(true);
  });

  it('gives every feature a label that exists, an icon key and an area', () => {
    for (const f of supportFeatures) {
      expect(lookup(f.labelKey), f.id).toBeTruthy();
      expect(f.iconKey.trim(), f.id).not.toBe('');
      expect(f.area.trim(), f.id).not.toBe('');
    }
  });

  it('covers the brief 25.3 areas', () => {
    const areas = supportFeatures.map((f) => f.area.toLowerCase());
    for (const a of [
      'learning',
      'quizzes',
      'notes',
      'competitions',
      'battle room',
      'calendar',
      'certificates',
      'reports',
      'billing',
      'login',
      'themes',
    ])
      expect(
        areas.some((x) => x.includes(a)),
        a,
      ).toBe(true);
  });

  it('does not include Other (the picker adds it)', () => {
    expect(supportFeatures.some((f) => f.id === 'other')).toBe(false);
  });
});

describe('issue types', () => {
  it('has the seven types from brief 25.3 with real labels', () => {
    expect(issueTypes).toHaveLength(7);
    expect(unique(issueTypes.map((t) => t.id))).toBe(true);
    for (const t of issueTypes) expect(lookup(t.labelKey), t.id).toBeTruthy();
    const labels = issueTypes.map((t) => text(t.labelKey).toLowerCase()).join(' | ');
    for (const w of ["isn't working", "can't sign in", 'how-to', 'mistake', 'billing', 'feature', 'accessibility'])
      expect(labels, w).toContain(w);
  });
});

describe('feedback tags', () => {
  it('has the eight quick tags from brief 19.1', () => {
    expect(unique(feedbackTags.map((t) => t.id))).toBe(true);
    const labels = feedbackTags.map((t) => text(t.labelKey));
    for (const l of [
      'Really useful',
      'Clear',
      'Unclear',
      'Too long',
      'Out of date',
      'Mistake in a question',
      'Not relevant to my role',
      'Hard to use on my phone',
    ])
      expect(labels).toContain(l);
  });

  it('references real keys', () => {
    for (const t of feedbackTags) expect(lookup(t.labelKey), t.id).toBeTruthy();
  });

  it('has ids the data layer can rely on for Unclear and Mistake in a question', () => {
    const ids = feedbackTags.map((t) => t.id);
    expect(ids).toContain('unclear');
    expect(ids).toContain('mistakeInQuestion');
  });
});

describe('FAQs', () => {
  const staff = faqs.filter((f) => f.audience === 'staff');
  const client = faqs.filter((f) => f.audience === 'client');

  it('has about 10 staff and 10 client FAQs with unique ids', () => {
    expect(staff.length).toBeGreaterThanOrEqual(8);
    expect(staff.length).toBeLessThanOrEqual(12);
    expect(client.length).toBeGreaterThanOrEqual(8);
    expect(client.length).toBeLessThanOrEqual(12);
    expect(staff.length + client.length).toBe(faqs.length);
    expect(unique(faqs.map((f) => f.id))).toBe(true);
  });

  it('has a question, answer and category key in en-GB.json for every FAQ', () => {
    for (const f of faqs) {
      expect(lookup(f.questionKey), `${f.id} question`).toBeTruthy();
      expect(lookup(f.answerKey), `${f.id} answer`).toBeTruthy();
      expect(lookup(f.categoryKey), `${f.id} category`).toBeTruthy();
    }
  });

  it('writes answers as plain text without Markdown', () => {
    for (const f of faqs) expect(text(f.answerKey), f.id).not.toMatch(/[*_`#]|\]\(|^\s*[-+]\s/m);
  });

  it('has no payment wording in staff FAQs', () => {
    for (const f of staff) {
      expect(text(f.questionKey), f.id).not.toMatch(PAYMENT);
      expect(text(f.answerKey), f.id).not.toMatch(PAYMENT);
    }
  });

  it('covers the brief 19.2 staff topics', () => {
    const all = staff.map((f) => `${text(f.questionKey)} ${text(f.answerKey)}`.toLowerCase()).join(' | ');
    for (const w of ['renew', 'xp', 'notes', 'closed-book', 'leaderboard', 'text size', 'log in'])
      expect(all, w).toContain(w);
  });

  it('covers the brief 19.2 client admin topics', () => {
    const all = client.map((f) => `${text(f.questionKey)} ${text(f.answerKey)}`.toLowerCase()).join(' | ');
    for (const w of [
      'invite',
      'publish',
      'categories',
      'auto-assign',
      'competition',
      'theme',
      'roles',
      'inspector',
      'billing',
    ])
      expect(all, w).toContain(w);
  });
});

describe('release notes', () => {
  it('has three notes with real titles and bodies, newest first', () => {
    expect(releaseNotes).toHaveLength(3);
    expect(unique(releaseNotes.map((n) => n.id))).toBe(true);
    for (const n of releaseNotes) {
      expect(n.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(lookup(n.titleKey), n.id).toBeTruthy();
      expect(lookup(n.bodyKey), n.id).toBeTruthy();
    }
    const dates = releaseNotes.map((n) => n.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('has no payment wording (the notes are shown to staff too)', () => {
    for (const n of releaseNotes) {
      expect(text(n.titleKey)).not.toMatch(PAYMENT);
      expect(text(n.bodyKey)).not.toMatch(PAYMENT);
    }
  });
});
