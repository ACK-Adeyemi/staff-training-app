// BP-13: .ics export (plan M3 assumption 33; RFC 5545; brief 28.2).
//
// API under test (calendar/ics.ts), pure:
//   toIcs(items: { id: string; title: string; date: string /* London YYYY-MM-DD */ }[], opts: { now: Date }) => string
//   A VCALENDAR with PRODID and VERSION:2.0 and one VEVENT per item with UID (a hash of the item id plus "@sta.invalid", so the
//   raw id never appears), DTSTAMP from `now` (UTC), DTSTART;VALUE=DATE (the date), DTEND;VALUE=DATE (next day) and SUMMARY
//   (the title, text-escaped). CRLF line endings, lines folded at 75 octets (continuation lines start with one space, no
//   multi-byte character is split). Nothing else: no DESCRIPTION, LOCATION, URL, ATTENDEE, ORGANIZER or other properties.
import { describe, expect, it } from 'vitest';
import { toIcs } from './ics';

const NOW = new Date('2026-10-19T09:00:00.000Z');
const item = (over: Partial<{ id: string; title: string; date: string }> = {}) => ({
  id: 'item-1',
  title: 'Safeguarding refresher',
  date: '2026-11-05',
  ...over,
});

const unfold = (ics: string): string[] =>
  ics
    .replace(/\r\n[ \t]/g, '')
    .split('\r\n')
    .filter((l) => l !== '');
const propName = (line: string): string => line.split(/[:;]/)[0]!;
const octets = (s: string): number => new TextEncoder().encode(s).length;

describe('calendar shape', () => {
  const ics = toIcs([item()], { now: NOW });

  it('is a VCALENDAR with PRODID and version 2.0', () => {
    const lines = unfold(ics);
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines.at(-1)).toBe('END:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines.some((l) => l.startsWith('PRODID:'))).toBe(true);
  });

  it('uses CRLF line endings throughout and ends with one', () => {
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(/(?<!\r)\n/.test(ics)).toBe(false);
    expect(ics).not.toMatch(/\r(?!\n)/);
  });

  it('is still a valid empty calendar with no items', () => {
    const lines = unfold(toIcs([], { now: NOW }));
    expect(lines).toContain('BEGIN:VCALENDAR');
    expect(lines.some((l) => l === 'BEGIN:VEVENT')).toBe(false);
  });

  it('has one balanced VEVENT per item', () => {
    const lines = unfold(toIcs([item(), item({ id: 'b' }), item({ id: 'c' })], { now: NOW }));
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(3);
    expect(lines.filter((l) => l === 'END:VEVENT')).toHaveLength(3);
  });
});

describe('event fields', () => {
  const lines = unfold(toIcs([item()], { now: NOW }));

  it('stamps the injected clock in UTC', () => {
    expect(lines).toContain('DTSTAMP:20261019T090000Z');
  });

  it('is an all-day event: DTSTART and DTEND with VALUE=DATE, the end being the next day', () => {
    expect(lines).toContain('DTSTART;VALUE=DATE:20261105');
    expect(lines).toContain('DTEND;VALUE=DATE:20261106');
  });

  it.each([
    ['2026-10-31', '20261101'],
    ['2026-12-31', '20270101'],
    ['2028-02-28', '20280229'],
  ])('rolls the end date over for %s', (date, end) => {
    expect(unfold(toIcs([item({ date })], { now: NOW }))).toContain(`DTEND;VALUE=DATE:${end}`);
  });

  it('carries the title as SUMMARY', () => {
    expect(lines).toContain('SUMMARY:Safeguarding refresher');
  });

  it('gives a UID at the sta.invalid domain that does not reveal the item id, is stable and differs per item', () => {
    const a = toIcs([item({ id: 'secret-person-id-123' })], { now: NOW });
    const uid = unfold(a).find((l) => l.startsWith('UID:'))!;
    expect(uid).toMatch(/^UID:[A-Za-z0-9-]+@sta\.invalid$/);
    expect(a).not.toContain('secret-person-id-123');
    expect(
      unfold(toIcs([item({ id: 'secret-person-id-123' })], { now: new Date('2027-01-01T00:00:00Z') })).find((l) =>
        l.startsWith('UID:'),
      ),
    ).toBe(uid);
    const other = unfold(toIcs([item({ id: 'other' })], { now: NOW })).find((l) => l.startsWith('UID:'));
    expect(other).not.toBe(uid);
  });
});

describe('text escaping', () => {
  it('escapes commas, semicolons, backslashes and newlines in SUMMARY', () => {
    const lines = unfold(toIcs([item({ title: 'Fire, safety; part\\1\nnext' })], { now: NOW }));
    expect(lines).toContain('SUMMARY:Fire\\, safety\\; part\\\\1\\nnext');
  });

  it('cannot inject another property through a title with a line break', () => {
    const ics = toIcs([item({ title: 'Hello\r\nATTENDEE:mailto:x@example.invalid' })], { now: NOW });
    expect(unfold(ics).some((l) => l.startsWith('ATTENDEE'))).toBe(false);
  });
});

describe('line folding', () => {
  it('keeps every physical line within 75 octets and continues with a single space', () => {
    const ics = toIcs([item({ title: 'A'.repeat(200) })], { now: NOW });
    const physical = ics.split('\r\n').filter((l) => l !== '');
    expect(Math.max(...physical.map(octets))).toBeLessThanOrEqual(75);
    expect(physical.some((l) => l.startsWith(' '))).toBe(true);
    expect(unfold(ics)).toContain(`SUMMARY:${'A'.repeat(200)}`);
  });

  it('does not fold a short line', () => {
    expect(
      toIcs([item()], { now: NOW })
        .split('\r\n')
        .some((l) => l.startsWith(' ')),
    ).toBe(false);
  });

  it('never splits a multi-byte character', () => {
    const title = 'Café sécurité '.repeat(12) + '🔥'.repeat(10);
    const ics = toIcs([item({ title })], { now: NOW });
    const physical = ics.split('\r\n').filter((l) => l !== '');
    expect(Math.max(...physical.map(octets))).toBeLessThanOrEqual(75);
    expect(unfold(ics)).toContain(`SUMMARY:${title}`);
    expect(ics).not.toContain('�');
  });
});

describe('what the file may contain', () => {
  const allowed = new Set([
    'BEGIN',
    'END',
    'VERSION',
    'PRODID',
    'CALSCALE',
    'UID',
    'DTSTAMP',
    'DTSTART',
    'DTEND',
    'SUMMARY',
  ]);

  it('has only allowlisted property names, however many items', () => {
    const items = [item(), item({ id: 'b', title: '3 Safeguarding expiries', date: '2026-12-01' })];
    for (const line of unfold(toIcs(items, { now: NOW }))) expect(allowed.has(propName(line))).toBe(true);
  });

  it('puts nothing but the title and dates in the file (no ids, links or names)', () => {
    const ics = toIcs([item({ id: '01HZX00000000000000000AAAA', title: '3 Safeguarding expiries' })], { now: NOW });
    expect(ics).not.toContain('01HZX00000000000000000AAAA');
    expect(ics).not.toMatch(/https?:/i);
    expect(ics).not.toMatch(/DESCRIPTION|LOCATION|URL|ATTENDEE|ORGANIZER/);
  });
});
