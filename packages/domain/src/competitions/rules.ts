// Builder rules (plan M2 assumption 16). Returns the broken rule names, empty when valid.
// Account availability and entitlement limits are checked in the data layer.
import { type Competition, CLOSED_BOOK_TEMPLATES, competitionSchema } from '../schemas/engagement';
import { competitionStatus } from './status';

export type CompetitionRule =
  | 'invalidCompetition'
  | 'endBeforeStart'
  | 'prizeRequired'
  | 'metricLocked'
  | 'endShortened'
  | 'competitionEnded'
  | 'competitionCancelled';

const LIMITS = { nameMax: 80, descriptionMax: 500, prizeMax: 120 };

const norm = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) => (Array.isArray(x) ? [...(x as unknown[])].map(String).sort() : x));

function shapeRules(c: Competition): CompetitionRule[] {
  const out: CompetitionRule[] = [];
  const bad = !competitionSchema.safeParse(c).success;
  const name = c.name.trim();
  const closedOk = c.templateId === undefined || CLOSED_BOOK_TEMPLATES.includes(c.templateId);
  if (
    bad ||
    name.length < 1 ||
    name.length > LIMITS.nameMax ||
    (c.description?.length ?? 0) > LIMITS.descriptionMax ||
    c.prizeText.length > LIMITS.prizeMax ||
    (c.closedBookOnly === true && !closedOk)
  ) {
    out.push('invalidCompetition');
  }
  if (new Date(c.endAt).getTime() <= new Date(c.startAt).getTime()) out.push('endBeforeStart');
  if (c.status !== 'draft' && c.prizeText.trim().length < 1) out.push('prizeRequired');
  return out;
}

export function validateCompetition(before: Competition | undefined, after: Competition, now: Date): CompetitionRule[] {
  if (before) {
    const was = competitionStatus(before, now);
    if (was === 'cancelled') return ['competitionCancelled'];
    if (was === 'ended') return ['competitionEnded'];
    if (after.status === 'cancelled') return [];
  }
  const out = shapeRules(after);
  if (before && competitionStatus(before, now) === 'live') {
    const locked =
      before.templateId !== after.templateId ||
      (before.closedBookOnly ?? false) !== (after.closedBookOnly ?? false) ||
      norm(before.moduleIds) !== norm(after.moduleIds) ||
      before.teamUnit !== after.teamUnit ||
      norm(before.eligibility) !== norm(after.eligibility);
    if (locked) out.push('metricLocked');
    if (new Date(after.endAt).getTime() < new Date(before.endAt).getTime()) out.push('endShortened');
  }
  return out;
}
