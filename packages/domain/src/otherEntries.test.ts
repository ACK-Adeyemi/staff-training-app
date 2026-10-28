// M4 chunk 3: reviewing "Other" free-text answers on tickets, written before the implementation (brief 25.7).
//
// API under test (otherEntries.ts):
//   type OtherField = 'feature' | 'issueType'       // reads featureOtherText / issueTypeOtherText on a Ticket
//   normaliseOtherText(text: string): string          // lower case, punctuation removed (apostrophes too), whitespace collapsed and trimmed
//   type OtherGroupView = OtherEntryGroup & { clientCount: number }   // clientCount = distinct clientIds
//   groupOtherEntries(tickets: Ticket[], field: OtherField): OtherGroupView[]
//     Only tickets with non-blank text for that field and no id set for it (featureId / issueTypeId) are entries.
//     Groups by normalised phrase; count = ticketIds.length; examples = distinct original wordings;
//     firstSeen/lastSeen from ticket createdAt; review 'unreviewed'; sorted by count desc then normalised asc.
//     Each group parses with otherEntryGroupSchema. No staff ids or names appear anywhere in a group.
//   trendingPhrase(tickets, field, clock, opts?: { days?: number; minCount?: number }): string | undefined
//     Normalised phrase with the most entries created in the last `days` (default 30) up to now (window start inclusive,
//     createdAt after now ignored); needs at least minCount (default 5); ties broken by normalised asc.
//   retagEntries(tickets, selectedIds: string[], field, outcomeId: string): Ticket[]
//     Same order and length. Selected tickets get featureId / issueTypeId = outcomeId and the other text cleared;
//     every other ticket is returned as the same object, unchanged.
import { describe, expect, it } from 'vitest';
import { fixedClock } from './clock';
import { groupOtherEntries, normaliseOtherText, retagEntries, trendingPhrase } from './otherEntries';
import { otherEntryGroupSchema } from './schemas/m4';
import type { Ticket } from './schemas/support';

const uid = (n: number) => String(n).padStart(26, '0'); // ids are 26-character ULIDs
const clock = fixedClock('2026-03-10T12:00:00.000Z');
const day = (d: number) => new Date(Date.parse('2026-03-10T12:00:00.000Z') - d * 86_400_000).toISOString();

const ticket = (n: number, text: string | undefined, over: Partial<Ticket> = {}): Ticket => ({
  id: uid(n),
  number: `T-${n}`,
  clientId: uid(1),
  raisedBy: uid(50),
  raiserSide: 'client',
  sharedWithManager: false,
  issueTypeOtherText: text,
  title: 'Help',
  description: 'Needs help.',
  impact: 'question',
  priority: 'normal',
  status: 'received',
  tags: [],
  context: {},
  linkedErrorIds: [],
  createdAt: day(2),
  updatedAt: day(2),
  ...over,
});

describe('normaliseOtherText', () => {
  it('ignores case, punctuation and extra spaces', () => {
    expect(normaliseOtherText("  Certificate   WON'T download! ")).toBe('certificate wont download');
    expect(normaliseOtherText('certificate wont download')).toBe('certificate wont download');
  });
});

describe('groupOtherEntries', () => {
  it('groups near-duplicate wordings with counts, examples and distinct client counts', () => {
    const tickets = [
      ticket(1, "Certificate won't download", { clientId: uid(1), createdAt: day(5) }),
      ticket(2, 'certificate wont  download.', { clientId: uid(1), createdAt: day(3) }),
      ticket(3, 'CERTIFICATE WONT DOWNLOAD', { clientId: uid(2), createdAt: day(1) }),
      ticket(4, 'Rota is wrong', { clientId: uid(2) }),
    ];
    const groups = groupOtherEntries(tickets, 'issueType');
    expect(groups.map((g) => g.normalised)).toEqual(['certificate wont download', 'rota is wrong']);
    const top = groups[0]!;
    expect(top.count).toBe(3);
    expect(top.clientCount).toBe(2);
    expect(top.ticketIds).toEqual([uid(1), uid(2), uid(3)]);
    expect(top.examples).toHaveLength(3);
    expect(top.firstSeen).toBe(day(5));
    expect(top.lastSeen).toBe(day(1));
    expect(top.review).toBe('unreviewed');
    expect(groups[1]!.clientCount).toBe(1);
    for (const g of groups) expect(otherEntryGroupSchema.safeParse(g).success).toBe(true);
  });

  it('skips blank text, tickets already tagged with an id, and the other field', () => {
    const tickets = [
      ticket(1, '   '),
      ticket(2, undefined),
      ticket(3, 'Already sorted', { issueTypeId: 'login' }),
      ticket(4, 'Staff rota', { featureOtherText: 'Staff rota', issueTypeOtherText: undefined }),
    ];
    expect(groupOtherEntries(tickets, 'issueType')).toEqual([]);
    const features = groupOtherEntries(tickets, 'feature');
    expect(features.map((g) => g.normalised)).toEqual(['staff rota']);
    expect(features[0]!.field).toBe('feature');
  });

  it('never exposes who raised an entry', () => {
    const groups = groupOtherEntries([ticket(1, 'Cert problem', { raisedBy: uid(77) })], 'issueType');
    const json = JSON.stringify(groups);
    expect(json).not.toContain(uid(77));
    expect(json).not.toContain('raisedBy');
  });
});

describe('trendingPhrase', () => {
  const many = (start: number, text: string, n: number, ago: number) =>
    Array.from({ length: n }, (_, i) => ticket(start + i, text, { createdAt: day(ago + i) }));

  it('flags the phrase with the most entries in the last 30 days, at 5 or more', () => {
    const tickets = [...many(10, "Certificate won't download", 5, 1), ...many(30, 'Staff rota', 4, 1)];
    expect(trendingPhrase(tickets, 'issueType', clock)).toBe('certificate wont download');
  });

  it('does not count entries older than the window or in the future, and returns nothing below the minimum', () => {
    const tickets = [
      ...many(10, 'Old problem', 6, 31), // all older than 30 days
      ...many(30, 'Fresh problem', 4, 1),
      ticket(50, 'Fresh problem', { createdAt: '2026-03-11T00:00:00.000Z' }), // after now
    ];
    expect(trendingPhrase(tickets, 'issueType', clock)).toBeUndefined();
    expect(trendingPhrase(tickets, 'issueType', clock, { minCount: 4 })).toBe('fresh problem');
  });
});

describe('retagEntries', () => {
  it('re-tags only the selected tickets and returns the others untouched', () => {
    const a = ticket(1, "Certificate won't download");
    const b = ticket(2, 'certificate wont download');
    const c = ticket(3, 'Certificate wont download');
    const out = retagEntries([a, b, c], [uid(1), uid(3)], 'issueType', 'new-issue-type');
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ id: uid(1), issueTypeId: 'new-issue-type', issueTypeOtherText: undefined });
    expect(out[2]).toMatchObject({ id: uid(3), issueTypeId: 'new-issue-type', issueTypeOtherText: undefined });
    expect(out[1]).toBe(b);
    expect(b.issueTypeId).toBeUndefined();
    expect(a.issueTypeOtherText).toBe("Certificate won't download"); // inputs not mutated
  });
});
