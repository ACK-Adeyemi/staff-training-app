// .ics export (RFC 5545; brief 28.2; plan M3 assumption 33). Titles and dates only: no description, location, links,
// names or ids. UIDs are a hash of the item id so the raw id never appears. Pure: `now` comes from the caller.

export type IcsItem = { id: string; title: string; date: string };

const DOMAIN = 'sta.invalid';

/** cyrb53: a small, stable, non-cryptographic hash, enough to keep UIDs unique and the raw id private. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

const escapeText = (s: string): string =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');

const octets = (ch: string): number => new TextEncoder().encode(ch).length;

/** Fold at 75 octets; continuation lines start with one space. Never splits a character. */
function fold(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = octets(ch);
    if (size + n > 75) {
      out.push(current);
      current = ' ';
      size = 1;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out;
}

const compact = (date: string): string => date.replace(/-/g, '');

const nextDay = (date: string): string => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

const stamp = (now: Date): string => `${now.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;

export function toIcs(items: IcsItem[], opts: { now: Date }): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Staff Training App//Calendar//EN', 'CALSCALE:GREGORIAN'];
  for (const item of items) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${hash(item.id)}@${DOMAIN}`,
      `DTSTAMP:${stamp(opts.now)}`,
      `DTSTART;VALUE=DATE:${compact(item.date)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(item.date))}`,
      `SUMMARY:${escapeText(item.title)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.flatMap(fold).join('\r\n') + '\r\n';
}
