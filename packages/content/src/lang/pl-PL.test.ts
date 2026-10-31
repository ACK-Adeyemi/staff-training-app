// M5 chunk 6 (F-4): the Polish file keeps staff free of payment wording, mirroring the en-GB staff wording test.
import { describe, expect, it } from 'vitest';
import plPL from './pl-PL.json' with { type: 'json' };

const flatten = (node: unknown, prefix = ''): { key: string; value: string }[] => {
  if (typeof node === 'string') return [{ key: prefix, value: node }];
  if (node && typeof node === 'object')
    return Object.entries(node).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
  return [];
};
const all = flatten(plPL);

// \b does not understand Polish letters, so word edges are written with Unicode letter lookarounds.
const edge = (body: string) => `(?<![\\p{L}])(?:${body})(?![\\p{L}])`;
const payment = new RegExp(
  edge(
    [
      'płatno\\p{L}*',
      'płać\\p{L}*',
      'zapłać\\p{L}*',
      'zapłat\\p{L}*',
      'opłat\\p{L}*',
      'faktur\\p{L}*',
      'subskrypcj\\p{L}*',
      'abonament\\p{L}*',
      'cen(?:a|y|ę|ie|ą|o|ami|ach|om)',
      'kart\\p{L}* płatnicz\\p{L}*',
      'rachun(?:ek|ku|kiem|ki|ków)',
    ].join('|'),
  ) + '|[£$€]',
  'iu',
);

describe('pl-PL.json payment wording', () => {
  it('has strings to check', () => {
    expect(all.length).toBeGreaterThan(0);
  });

  it('catches the Polish payment words this test is meant to catch', () => {
    for (const w of [
      'Twoja płatność',
      'zapłać teraz',
      'Nowa faktura',
      'subskrypcja',
      'abonament',
      'cena',
      'karta płatnicza',
      'rachunek',
      'opłata',
    ])
      expect(payment.test(w), w).toBe(true);
    expect(payment.test('Centrum szkoleń')).toBe(false);
  });

  it('has no payment wording in any Polish string', () => {
    expect(all.filter((l) => payment.test(l.value) || payment.test(l.key)).map((l) => `${l.key}: ${l.value}`)).toEqual(
      [],
    );
  });
});
