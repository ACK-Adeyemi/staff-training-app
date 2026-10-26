import {
  AccountStateError,
  ForbiddenError,
  NotEntitledError,
  NotFoundError,
  RuleError,
  ValidationError,
} from '@sta/data';
import type { MessageKey } from '@sta/content';

/** Turns anything the data layer throws into a plain sentence for the competition screens. */
export function competitionErrorKey(e: unknown): MessageKey {
  if (e instanceof RuleError) return `errors.rule.${e.rule}`;
  if (e instanceof NotEntitledError) {
    if (e.feature === 'liveCompetitions') return 'errors.notEntitled.liveCompetitions';
    if (e.feature === 'closedBookCompetitions') return 'errors.notEntitled.closedBookCompetitions';
    return 'errors.notEntitled.other';
  }
  if (e instanceof AccountStateError) return 'errors.accountState';
  if (e instanceof ForbiddenError) return 'errors.forbidden';
  if (e instanceof NotFoundError) return 'competition.notFound';
  if (e instanceof ValidationError) return 'errors.validation';
  return 'competition.actionError';
}
