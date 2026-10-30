// M5 chunk 11 (F-3, BP-1): the Track A and Track B tour definitions (build pack 8.1 steps 1 to 9, 8.2 steps 1 to 7).
// Contract: packages/content/src/tours/trackA.ts exports `trackA` and trackB.ts exports `trackB`, each
//   { id: string; steps: { id: string; captionKey: string; persona: string; route: string; target?: string }[]; tryNext: string[] }
// `persona` is a first name from the seed ('Priya', 'Jade', ...) or 'Provider' for the provider side.
// `route` is an app path such as '/client/calendar' (no '#'). `target` is a data-tour value on a page element.
// Routes and personas are checked against the router and seed in apps/web/src/demo/tours.test.ts.
import { describe, expect, it } from 'vitest';
import enGB from '../lang/en-GB.json' with { type: 'json' };
import { trackA } from './trackA';
import { trackB } from './trackB';

function flat(node: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (typeof node === 'string') out[prefix] = node;
  else if (node && typeof node === 'object')
    for (const [k, v] of Object.entries(node)) flat(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}
const messages = flat(enGB);
const staffPersonas = new Set(['Jade', 'Maureen']);
const paymentWords = /\b(pay|paid|payment|payments|invoice|invoices|price|prices|pricing|billing|subscription|card|£)\b|£/i;

const cases = [
  {
    name: 'Track A',
    tour: trackA,
    personas: ['Priya', 'Priya', 'Jade', 'Maureen', 'Priya', 'Priya', 'Priya', 'Fiona', 'Daniel'],
    routes: [
      /^\/client$/,
      /^\/client\/calendar$/,
      /^\/staff$/,
      /^\/staff$/,
      /^\/client\/evidence$/,
      /^\/client\/modules\/new$/,
      /^\/client\/competitions$/,
      /^\/client\/people$/,
      /^\/client\/modules\/[^/]+\/preview\/[^/]+$/,
    ],
  },
  {
    name: 'Track B',
    tour: trackB,
    personas: Array<string>(7).fill('Provider'),
    routes: [
      /^\/provider$/,
      /^\/provider\/clients\/[^/]+$/,
      /^\/provider\/tickets$/,
      /^\/provider\/dunning$/,
      /^\/provider\/team$/,
      /^\/provider\/pricing$/,
      /^\/provider\/security$/,
    ],
  },
];

describe.each(cases)('$name tour definition', ({ tour, personas, routes }) => {
  it('has the same number of steps as the demo script, in order, one persona each', () => {
    expect(tour.steps.map((s) => s.persona)).toEqual(personas);
  });

  it('opens a distinctive screen for each demo script step', () => {
    expect(tour.steps.map((s) => s.route.split('?')[0])).toHaveLength(routes.length);
    tour.steps.forEach((s, i) => {
      expect(s.route.split('?')[0], `step ${String(i + 1)}`).toMatch(routes[i] as RegExp);
    });
  });

  it('uses app paths, not hash links', () => {
    for (const s of tour.steps) expect(s.route.startsWith('/') && !s.route.includes('#')).toBe(true);
  });

  it('gives every step a unique id and a caption key that exists in en-GB.json under tour', () => {
    const ids = tour.steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of tour.steps) {
      expect(s.id.length).toBeGreaterThan(0);
      expect(s.captionKey.startsWith('tour.'), s.captionKey).toBe(true);
      expect(messages[s.captionKey], s.captionKey).toBeTruthy();
    }
  });

  it('has a non-empty Try this next list whose keys exist in en-GB.json under tour', () => {
    expect(tour.tryNext.length).toBeGreaterThanOrEqual(2);
    for (const key of tour.tryNext) {
      expect(key.startsWith('tour.'), key).toBe(true);
      expect(messages[key], key).toBeTruthy();
    }
  });

  it('has a tour id and a first step with a highlight target', () => {
    expect(tour.id.length).toBeGreaterThan(0);
    expect(tour.steps[0]?.target, 'first step target').toBeTruthy();
  });

  it('keeps captions short, plain, free of markup, and distinct', () => {
    const texts = tour.steps.map((s) => messages[s.captionKey] ?? '');
    for (const text of texts) {
      expect(text.length).toBeGreaterThan(15);
      expect(text.length).toBeLessThanOrEqual(220);
      expect(text).not.toMatch(/[<>*_#`{}]/);
      expect(text).not.toMatch(/\b(TODO|lorem|VERIFY)\b/i);
    }
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('uses no payment wording in captions of steps shown as a staff member', () => {
    for (const s of tour.steps.filter((x) => staffPersonas.has(x.persona))) {
      expect(messages[s.captionKey], s.id).not.toMatch(paymentWords);
    }
  });
});

describe('the two tours together', () => {
  it('have different ids and no shared step ids or caption keys', () => {
    expect(trackA.id).not.toBe(trackB.id);
    const a = new Set([...trackA.steps.map((s) => s.id), ...trackA.steps.map((s) => s.captionKey)]);
    for (const s of trackB.steps) {
      expect(a.has(s.id)).toBe(false);
      expect(a.has(s.captionKey)).toBe(false);
    }
  });

  it('have Track A step 3 and 4 on the staff app and Track B entirely on the provider app', () => {
    expect(trackA.steps[2]?.route.startsWith('/staff')).toBe(true);
    expect(trackA.steps[3]?.route.startsWith('/staff')).toBe(true);
    for (const s of trackB.steps) expect(s.route.startsWith('/provider')).toBe(true);
  });

  it('have the shell strings (buttons and labels) under tour in en-GB.json', () => {
    const shell = Object.keys(messages).filter((k) => k.startsWith('tour.'));
    expect(shell.length).toBeGreaterThan(trackA.steps.length + trackB.steps.length);
  });
});
