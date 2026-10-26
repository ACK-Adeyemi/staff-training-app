// M2 chunk 5 (F-8): the nursery prize list is exactly brief 13.3, stored as JSON, and feeds the pack.
import { describe, expect, it } from 'vitest';
import prizes from './prizes.json' with { type: 'json' };
import { nurseryPack } from '../nursery';

const brief = [
  "£20 online shopping voucher (retailer of the winner's choice)",
  '£25 high street shopping voucher',
  '£15 coffee shop voucher',
  'x1 free lunch (max spend £10)',
  'Luxury face mask kit',
  'Cinema trip for two (up to £25)',
  '£20 takeaway or food delivery voucher',
  'Box of premium chocolates (up to £15)',
  '£15 book voucher',
  'Pamper bath and candle gift set',
  'Indoor plant and pot (up to £15)',
  'Extra paid hour off, agreed with your manager',
  '£20 wellbeing voucher (massage, yoga or fitness class)',
  'Gourmet tea and coffee gift set (up to £20)',
  'Movie night kit: snacks and a £10 streaming voucher',
  'Board game or puzzle of your choice (up to £20)',
  '£20 garden centre voucher',
  'Insulated travel mug and tote bag set (up to £20)',
  'Afternoon tea for two (up to £30)',
  'Team pizza lunch (up to £50, ideal for team prizes)',
];

const denylist = [
  'wine',
  'beer',
  'prosecco',
  'champagne',
  'gin',
  'alcohol',
  'cigar',
  'cigarette',
  'vape',
  'tobacco',
  'lottery',
  'scratchcard',
  'raffle ticket',
  'bet',
  'betting',
  'casino',
  'gambling',
];

describe('nursery prizes.json', () => {
  it('is an array of exactly 20 strings', () => {
    expect(Array.isArray(prizes)).toBe(true);
    expect(prizes).toHaveLength(20);
    for (const p of prizes as unknown[]) expect(typeof p).toBe('string');
  });

  it('matches the brief 13.3 suggestions verbatim and in order', () => {
    expect(prizes).toEqual(brief);
  });

  it('has no duplicates ignoring case', () => {
    expect(new Set(prizes.map((p) => p.toLowerCase())).size).toBe(20);
  });

  it('contains no alcohol, tobacco or gambling words', () => {
    const hits = prizes.filter((p) => denylist.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(p)));
    expect(hits).toEqual([]);
  });

  it('is what nurseryPack.prizeSuggestions uses', () => {
    expect(nurseryPack.prizeSuggestions).toEqual(brief);
  });
});
