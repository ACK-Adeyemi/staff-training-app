// Shared building blocks for the schemas. Build pack section 6.
import { z } from 'zod';

/** A ULID: 26 upper-case Crockford base32 characters (no I, L, O or U). */
export const idSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Not a valid id');

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** An ISO 8601 date-time with a Z or offset designator, and a real calendar day. */
export const isoDateSchema = z.string().refine((value) => {
  const m = ISO_PATTERN.exec(value);
  if (!m) return false;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (mo < 1 || mo > 12 || h > 23 || mi > 59 || s > 59) return false;
  return d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}, 'Not a valid ISO 8601 date and time');

/** Money is integer pence, never negative. */
export const penceSchema = z.number().int().nonnegative();

export const countSchema = z.number().int().nonnegative();

export const accountStateSchema = z.enum([
  'trial',
  'active',
  'pastDue',
  'limited',
  'readOnly',
  'closed',
  'deleted',
  'paused',
]);

export const sideSchema = z.enum(['staff', 'client', 'provider']);
export type AccountState = z.infer<typeof accountStateSchema>;
