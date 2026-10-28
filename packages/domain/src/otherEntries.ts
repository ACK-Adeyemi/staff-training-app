// Reviewing "Other" free-text answers on tickets (brief 25.7). Pure; time comes from the injected Clock.
import type { Clock } from './clock';
import type { OtherEntryGroup } from './schemas/m4';
import type { Ticket } from './schemas/support';

export type OtherField = 'feature' | 'issueType';
export type OtherGroupView = OtherEntryGroup & { clientCount: number };

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const DAY_MS = 86_400_000;

export const normaliseOtherText = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

const textOf = (t: Ticket, field: OtherField): string | undefined =>
  field === 'feature' ? t.featureOtherText : t.issueTypeOtherText;
const idOf = (t: Ticket, field: OtherField): string | undefined => (field === 'feature' ? t.featureId : t.issueTypeId);

const entryPhrase = (t: Ticket, field: OtherField): string | undefined => {
  const text = textOf(t, field);
  if (text === undefined || idOf(t, field)) return undefined;
  const n = normaliseOtherText(text);
  return n === '' ? undefined : n;
};

/** A stable 26-character id derived from the field and phrase (two FNV-style hashes, no randomness). */
const groupId = (field: OtherField, normalised: string): string => {
  const s = `${field}:${normalised}`;
  let out = '';
  let h = 2166136261;
  for (let i = 0; i < 26; i++) {
    for (let j = 0; j < s.length; j++) h = Math.imul(h ^ (s.charCodeAt(j) + i), 16777619) >>> 0;
    h = Math.imul(h ^ (i + 1), 16777619) >>> 0;
    out += ALPHABET.charAt(h % 32);
  }
  return out;
};

export const groupOtherEntries = (tickets: Ticket[], field: OtherField): OtherGroupView[] => {
  const map = new Map<string, Ticket[]>();
  for (const t of tickets) {
    const p = entryPhrase(t, field);
    if (p === undefined) continue;
    const list = map.get(p);
    if (list) list.push(t);
    else map.set(p, [t]);
  }
  const groups: OtherGroupView[] = [];
  for (const [normalised, list] of map) {
    const times = list.map((t) => Date.parse(t.createdAt));
    const first = list[times.indexOf(Math.min(...times))] ?? list[0];
    const last = list[times.indexOf(Math.max(...times))] ?? list[0];
    if (!first || !last) continue;
    groups.push({
      id: groupId(field, normalised),
      field,
      normalised,
      examples: [...new Set(list.map((t) => (textOf(t, field) ?? '').trim()))],
      ticketIds: list.map((t) => t.id),
      count: list.length,
      clientCount: new Set(list.map((t) => t.clientId)).size,
      firstSeen: first.createdAt,
      lastSeen: last.createdAt,
      review: 'unreviewed',
    });
  }
  return groups.sort(
    (a, b) => b.count - a.count || (a.normalised < b.normalised ? -1 : a.normalised > b.normalised ? 1 : 0),
  );
};

export const trendingPhrase = (
  tickets: Ticket[],
  field: OtherField,
  clock: Clock,
  opts: { days?: number; minCount?: number } = {},
): string | undefined => {
  const now = clock.now().getTime();
  const start = now - (opts.days ?? 30) * DAY_MS;
  const min = opts.minCount ?? 5;
  const counts = new Map<string, number>();
  for (const t of tickets) {
    const p = entryPhrase(t, field);
    const at = Date.parse(t.createdAt);
    if (p === undefined || at < start || at > now) continue;
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [p, c] of counts) {
    if (c < min) continue;
    if (c > bestCount || (c === bestCount && best !== undefined && p < best)) {
      best = p;
      bestCount = c;
    }
  }
  return best;
};

export const retagEntries = (
  tickets: Ticket[],
  selectedIds: string[],
  field: OtherField,
  outcomeId: string,
): Ticket[] => {
  const chosen = new Set(selectedIds);
  return tickets.map((t) => {
    if (!chosen.has(t.id)) return t;
    return field === 'feature'
      ? { ...t, featureId: outcomeId, featureOtherText: undefined }
      : { ...t, issueTypeId: outcomeId, issueTypeOtherText: undefined };
  });
};
