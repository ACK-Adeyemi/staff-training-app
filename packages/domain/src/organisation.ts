// Organisation name rules, the name shown at a date and the "formerly" note (brief 30.2; M3 assumption 9).
import { adminConfig } from './config/admin';
import { addDays } from './dates';
import type { Client } from './schemas/tenancy';

export type OrgNameProblem = 'tooShort' | 'tooLong' | 'controlCharacters' | 'placeholder';
type NameClient = Pick<Client, 'displayName' | 'nameHistory'>;

export function validateOrgName(
  name: string,
  kind: 'display' | 'short' = 'display',
): { ok: true; value: string } | { ok: false; reason: OrgNameProblem } {
  const value = name.trim();
  const length = Array.from(value).length;
  const [min, max] = kind === 'short' ? [1, 20] : [2, 60];
  if (length < min) return { ok: false, reason: 'tooShort' };
  if (length > max) return { ok: false, reason: 'tooLong' };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value)) return { ok: false, reason: 'controlCharacters' };
  if (/^[\d\s\p{P}\p{S}]+$/u.test(value)) return { ok: false, reason: 'placeholder' };
  return { ok: true, value };
}

const byChange = (client: NameClient) =>
  [...client.nameHistory].sort((a, b) => Date.parse(a.changedAt) - Date.parse(b.changedAt));

/** The name in force at `at`; a change applies from its changedAt instant. */
export function displayNameAt(client: NameClient, at: Date | string): string {
  const t = (typeof at === 'string' ? new Date(at) : at).getTime();
  const next = byChange(client).find((c) => Date.parse(c.changedAt) > t);
  return next ? next.old : client.displayName;
}

export function formerlyNote(client: NameClient, now: Date): { old: string; changedAt: string } | null {
  const last = byChange(client).at(-1);
  if (!last) return null;
  if (now.getTime() >= addDays(new Date(last.changedAt), adminConfig.formerlyNameDays).getTime()) return null;
  return { old: last.old, changedAt: last.changedAt };
}
