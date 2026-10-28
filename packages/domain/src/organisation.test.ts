// BP-8 (pure part): organisation name rules, the name shown at a date and the "formerly" note (brief 30.2; M3 assumption 9).
//
// API under test (organisation.ts):
//   validateOrgName(name: string, kind?: 'display' | 'short'): { ok: true; value: string } | { ok: false; reason: OrgNameProblem }
//       trims; display 2 to 60 characters (default kind), short 1 to 20; OrgNameProblem = 'tooShort' | 'tooLong' |
//       'controlCharacters' | 'placeholder' (only digits and punctuation); length is counted after trimming
//   displayNameAt(client: { displayName; nameHistory }, at: Date | string): string
//       the name in force at `at`: the `old` name of the first change after `at`, otherwise the current display name;
//       a change applies from its changedAt instant (at === changedAt gives the new name). Used for certificates.
//   formerlyNote(client, now: Date): { old: string; changedAt: string } | null
//       the most recent change's old name while now is less than adminConfig.formerlyNameDays (90) after changedAt, else null
import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { displayNameAt, formerlyNote, validateOrgName } from './organisation';

describe('validateOrgName', () => {
  it('accepts a normal name and returns it trimmed', () => {
    expect(validateOrgName('  Little Acorns Nursery  ')).toEqual({ ok: true, value: 'Little Acorns Nursery' });
  });

  it('accepts 2 and 60 characters and refuses 1 and 61', () => {
    expect(validateOrgName('Oz').ok).toBe(true);
    expect(validateOrgName('a'.repeat(60)).ok).toBe(true);
    expect(validateOrgName('A')).toEqual({ ok: false, reason: 'tooShort' });
    expect(validateOrgName('a'.repeat(61))).toEqual({ ok: false, reason: 'tooLong' });
  });

  it('counts length after trimming, so padding does not rescue a short name', () => {
    expect(validateOrgName('   A   ')).toEqual({ ok: false, reason: 'tooShort' });
    expect(validateOrgName(`  ${'a'.repeat(60)}  `).ok).toBe(true);
  });

  it('refuses control characters', () => {
    expect(validateOrgName('Oak\u0007 Tree')).toEqual({ ok: false, reason: 'controlCharacters' });
    expect(validateOrgName('Oak\nTree')).toEqual({ ok: false, reason: 'controlCharacters' });
  });

  it('refuses names that are only digits or punctuation', () => {
    expect(validateOrgName('12345')).toEqual({ ok: false, reason: 'placeholder' });
    expect(validateOrgName('...')).toEqual({ ok: false, reason: 'placeholder' });
    expect(validateOrgName('12 - 34!')).toEqual({ ok: false, reason: 'placeholder' });
    expect(validateOrgName('Studio 54').ok).toBe(true);
  });

  it('allows up to 20 characters for a short name', () => {
    expect(validateOrgName('a'.repeat(20), 'short').ok).toBe(true);
    expect(validateOrgName('a'.repeat(21), 'short')).toEqual({ ok: false, reason: 'tooLong' });
  });
});

const change = (old: string, nu: string, changedAt: string) => ({
  old,
  new: nu,
  changedBy: '01HZX0000000000000000000U1',
  changedAt,
  reviewStatus: 'pendingReview' as const,
});
const NOW = new Date('2026-10-26T12:00:00.000Z');

describe('displayNameAt', () => {
  const client = {
    displayName: 'Oak Tree Nurseries Group',
    nameHistory: [
      change('Oak Tree', 'Oak Tree Nurseries', '2025-03-01T10:00:00.000Z'),
      change('Oak Tree Nurseries', 'Oak Tree Nurseries Group', '2026-10-01T10:00:00.000Z'),
    ],
  };

  it('gives the current name when nothing changed since', () => {
    expect(displayNameAt(client, new Date('2026-10-20T00:00:00.000Z'))).toBe('Oak Tree Nurseries Group');
  });

  it('gives the name that was in force when a certificate was issued before the latest change', () => {
    expect(displayNameAt(client, new Date('2026-06-01T00:00:00.000Z'))).toBe('Oak Tree Nurseries');
  });

  it('walks back through several changes', () => {
    expect(displayNameAt(client, new Date('2024-01-01T00:00:00.000Z'))).toBe('Oak Tree');
  });

  it('uses the new name from the instant of the change', () => {
    expect(displayNameAt(client, new Date('2026-10-01T10:00:00.000Z'))).toBe('Oak Tree Nurseries Group');
    expect(displayNameAt(client, new Date('2026-10-01T09:59:59.000Z'))).toBe('Oak Tree Nurseries');
  });

  it('accepts an ISO string and an empty history', () => {
    expect(displayNameAt(client, '2024-01-01T00:00:00.000Z')).toBe('Oak Tree');
    expect(displayNameAt({ displayName: 'Solo', nameHistory: [] }, NOW)).toBe('Solo');
  });
});

describe('formerlyNote', () => {
  const renamed = (daysAgo: number) => ({
    displayName: 'New Name Ltd',
    nameHistory: [change('Old Name', 'New Name Ltd', addDays(NOW, -daysAgo).toISOString())],
  });

  it('names the old name within 90 days of the change', () => {
    expect(formerlyNote(renamed(1), NOW)?.old).toBe('Old Name');
    expect(formerlyNote(renamed(89), NOW)?.old).toBe('Old Name');
  });

  it('shows nothing after 90 days', () => {
    expect(formerlyNote(renamed(91), NOW)).toBeNull();
    expect(formerlyNote(renamed(200), NOW)).toBeNull();
  });

  it('shows nothing when the name never changed', () => {
    expect(formerlyNote({ displayName: 'Solo', nameHistory: [] }, NOW)).toBeNull();
  });

  it('uses the most recent change when there are several in the window', () => {
    const client = {
      displayName: 'C',
      nameHistory: [
        change('A', 'B', addDays(NOW, -20).toISOString()),
        change('B', 'C', addDays(NOW, -5).toISOString()),
      ],
    };
    expect(formerlyNote(client, NOW)?.old).toBe('B');
  });

  it('ignores an old change when a newer one is the only one inside the window', () => {
    const client = {
      displayName: 'C',
      nameHistory: [
        change('A', 'B', addDays(NOW, -300).toISOString()),
        change('B', 'C', addDays(NOW, -10).toISOString()),
      ],
    };
    expect(formerlyNote(client, NOW)?.old).toBe('B');
  });
});
