import { AccountStateError, ForbiddenError, NotEntitledError, RuleError, ValidationError } from '@sta/data';
import type { MessageKey } from '@sta/content';

/** Turns anything the data layer throws into a plain sentence for the foundations screens. */
export function foundationsErrorKey(e: unknown): MessageKey {
  if (e instanceof RuleError) return `errors.rule.${e.rule}` as MessageKey;
  if (e instanceof NotEntitledError)
    return e.feature === 'customClientRoles' ? 'team.limit' : 'errors.notEntitled.other';
  if (e instanceof AccountStateError) return 'errors.accountState';
  if (e instanceof ForbiddenError) return 'errors.forbidden';
  if (e instanceof ValidationError) return 'errors.validation';
  return 'errors.generic';
}

export const inputClass =
  'min-h-[var(--target-min)] w-full max-w-md rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[var(--color-text)] focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]';
