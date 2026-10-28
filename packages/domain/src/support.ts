// Support ticket rules. Brief 25.3 and 25.4; M3 plan assumption 24.
import type { Ticket } from './schemas/support';

export const impactPriority = (impact: Ticket['impact']): Ticket['priority'] =>
  impact === 'blocked' ? 'high' : impact === 'workaround' ? 'normal' : 'low';

/** The nth ticket (1-based) is T-1001. */
export function ticketNumber(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error('A ticket number needs a positive whole sequence');
  return `T-${1000 + sequence}`;
}

/** Trim, collapse whitespace to single spaces and lower-case, so the same words match however typed. */
export const normaliseOtherText = (text: string): string => text.trim().replace(/\s+/g, ' ').toLowerCase();

export type TicketInput = {
  title: string;
  description: string;
  featureId?: string;
  featureOtherText?: string;
  issueTypeId?: string;
  issueTypeOtherText?: string;
};
export type TicketField = 'title' | 'description' | 'featureOtherText' | 'issueTypeOtherText';
export type TicketError = { field: TicketField; code: 'required' | 'tooShort' | 'tooLong' };

/** `meaningful` is the length that counts towards the minimum (spaces do not make a short text longer). */
const check = (
  field: TicketField,
  value: string,
  min: number,
  max: number,
  meaningful = value.length,
): TicketError[] =>
  value === ''
    ? [{ field, code: 'required' }]
    : meaningful < min
      ? [{ field, code: 'tooShort' }]
      : value.length > max
        ? [{ field, code: 'tooLong' }]
        : [];

const other = (field: TicketField, text: string | undefined): TicketError[] => {
  const normalised = normaliseOtherText(text ?? '');
  return check(field, normalised, 3, 80, normalised.replace(/ /g, '').length);
};

export function validateTicket(input: TicketInput): TicketError[] {
  return [
    ...check('title', input.title.trim(), 3, 100),
    ...check('description', input.description.trim(), 1, 2000),
    ...(input.featureId === 'other' ? other('featureOtherText', input.featureOtherText) : []),
    ...(input.issueTypeId === 'other' ? other('issueTypeOtherText', input.issueTypeOtherText) : []),
  ];
}
