// When a ticket needs its first reply by, and whether that time has passed (plan m4 chunk 7, BP-10). Pure.
import type { Ticket } from './schemas/support';

const HOUR_MS = 3_600_000;

export type ResponseStatus = { responseDueAt?: string; breached: boolean };

/**
 * An open ticket with no first reply is due at createdAt plus the package's response target hours. Replied,
 * resolved and closed tickets have no due time and are never breached.
 */
export const responseStatus = (
  ticket: Pick<Ticket, 'createdAt' | 'status' | 'firstResponseAt'>,
  targetHours: number,
  now: Date,
): ResponseStatus => {
  if (ticket.firstResponseAt !== undefined || ticket.status === 'resolved' || ticket.status === 'closed') {
    return { breached: false };
  }
  const due = Date.parse(ticket.createdAt) + targetHours * HOUR_MS;
  return { responseDueAt: new Date(due).toISOString(), breached: due < now.getTime() };
};
