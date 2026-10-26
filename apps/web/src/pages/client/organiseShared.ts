import { AccountStateError, ForbiddenError, RuleError } from '@sta/data';
import type { MessageKey } from '@sta/content';
import type { Category, ModuleGroup } from '@sta/domain';

export type Dlg =
  | { kind: 'newCategory' }
  | { kind: 'editCategory'; category: Category }
  | { kind: 'mergeCategory'; category: Category }
  | { kind: 'deleteCategory'; category: Category }
  | { kind: 'newGroup' }
  | { kind: 'editGroup'; group: ModuleGroup }
  | { kind: 'deleteGroup'; group: ModuleGroup };

/** Turns anything the data layer throws into a plain sentence. */
export function organiseErrorKey(e: unknown): MessageKey {
  if (e instanceof RuleError && e.rule === 'nameTaken') return 'errors.rule.nameTaken';
  if (e instanceof ForbiddenError) return 'organise.errorNotAllowed';
  if (e instanceof AccountStateError) return 'organise.errorAccountState';
  return 'organise.errorSave';
}

export const field =
  'min-h-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]';
