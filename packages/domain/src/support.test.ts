// BP-16: ticket rules (plan Assumption 24; brief 25.3 and 25.4).
//
// API under test:
//   impactPriority(impact: 'blocked' | 'workaround' | 'question'): 'high' | 'normal' | 'low'
//   ticketNumber(sequence: number): string       // 1-based count of tickets: 1 -> 'T-1001'; throws on a non-positive or fractional number
//   normaliseOtherText(text: string): string      // trim, collapse runs of whitespace to one space, lower case
//   validateTicket(input: TicketInput): { field: TicketField; code: 'required' | 'tooShort' | 'tooLong' }[]   // empty when valid
//     TicketInput = { title: string; description: string; featureId?: string; featureOtherText?: string; issueTypeId?: string; issueTypeOtherText?: string }
//     TicketField = 'title' | 'description' | 'featureOtherText' | 'issueTypeOtherText'
//     title 3 to 100 and description 1 to 2000 (both trimmed); when featureId or issueTypeId is 'other' its text is needed, 3 to 80 characters
//     after normalising; the other text is not checked when the id is anything else.
import { describe, expect, it } from 'vitest';
import { impactPriority, normaliseOtherText, ticketNumber, validateTicket } from './support';

const ok = { title: 'Cannot open my certificate', description: 'The page stays blank.' };
const fields = (i: Parameters<typeof validateTicket>[0]) => validateTicket(i).map((e) => `${e.field}:${e.code}`);

describe('impactPriority', () => {
  it.each([
    ['blocked', 'high'],
    ['workaround', 'normal'],
    ['question', 'low'],
  ] as const)('%s gives %s', (impact, priority) => {
    expect(impactPriority(impact)).toBe(priority);
  });
});

describe('ticketNumber', () => {
  it('starts at T-1001 and counts up', () => {
    expect(ticketNumber(1)).toBe('T-1001');
    expect(ticketNumber(2)).toBe('T-1002');
    expect(ticketNumber(250)).toBe('T-1250');
  });

  it('keeps going past four digits without padding or wrapping', () => {
    expect(ticketNumber(9000)).toBe('T-10000');
  });

  it('refuses nonsense', () => {
    expect(() => ticketNumber(0)).toThrow();
    expect(() => ticketNumber(-1)).toThrow();
    expect(() => ticketNumber(1.5)).toThrow();
  });
});

describe('normaliseOtherText', () => {
  it('trims, collapses spaces and lower-cases', () => {
    expect(normaliseOtherText('  My   Weird\tFeature \n')).toBe('my weird feature');
  });

  it('gives the same result for the same words however they are typed', () => {
    expect(normaliseOtherText('Print  LIST')).toBe(normaliseOtherText(' print list '));
  });

  it('gives an empty string for blank input', () => {
    expect(normaliseOtherText('   ')).toBe('');
  });
});

describe('validateTicket', () => {
  it('accepts a valid ticket', () => {
    expect(validateTicket(ok)).toEqual([]);
    expect(validateTicket({ ...ok, featureId: 'certificates', issueTypeId: 'bug', featureOtherText: 'x' })).toEqual([]);
  });

  it('checks the title between 3 and 100 characters after trimming', () => {
    expect(fields({ ...ok, title: '  ab ' })).toEqual(['title:tooShort']);
    expect(fields({ ...ok, title: '' })).toEqual(['title:required']);
    expect(fields({ ...ok, title: 'x'.repeat(101) })).toEqual(['title:tooLong']);
    expect(validateTicket({ ...ok, title: 'abc' })).toEqual([]);
    expect(validateTicket({ ...ok, title: 'x'.repeat(100) })).toEqual([]);
  });

  it('checks the description between 1 and 2000 characters after trimming', () => {
    expect(fields({ ...ok, description: '   ' })).toEqual(['description:required']);
    expect(fields({ ...ok, description: 'x'.repeat(2001) })).toEqual(['description:tooLong']);
    expect(validateTicket({ ...ok, description: 'x' })).toEqual([]);
    expect(validateTicket({ ...ok, description: 'x'.repeat(2000) })).toEqual([]);
  });

  it('needs 3 to 80 characters of text when the feature is Other', () => {
    expect(fields({ ...ok, featureId: 'other' })).toEqual(['featureOtherText:required']);
    expect(fields({ ...ok, featureId: 'other', featureOtherText: ' a  b ' })).toEqual(['featureOtherText:tooShort']);
    expect(fields({ ...ok, featureId: 'other', featureOtherText: 'x'.repeat(81) })).toEqual([
      'featureOtherText:tooLong',
    ]);
    expect(validateTicket({ ...ok, featureId: 'other', featureOtherText: 'abc' })).toEqual([]);
    expect(validateTicket({ ...ok, featureId: 'other', featureOtherText: 'x'.repeat(80) })).toEqual([]);
  });

  it('applies the same rule to an Other issue type', () => {
    expect(fields({ ...ok, issueTypeId: 'other', issueTypeOtherText: 'hi' })).toEqual(['issueTypeOtherText:tooShort']);
    expect(validateTicket({ ...ok, issueTypeId: 'other', issueTypeOtherText: 'slow screen' })).toEqual([]);
  });

  it('reports every problem at once', () => {
    expect(fields({ title: '', description: '', featureId: 'other', issueTypeId: 'other' })).toEqual([
      'title:required',
      'description:required',
      'featureOtherText:required',
      'issueTypeOtherText:required',
    ]);
  });
});
