// Drafts, versions, duplicates, the delete rule and re-assign. Brief 5.1; M3 plan assumption 11.
import type { Assignment, Attempt, LearningEvent, Module, ModuleDraft, ModuleVersion } from '../schemas/learning';
import type { Evidence } from '../schemas/evidence';
import type { Person } from '../schemas/tenancy';

const clone = <T>(value: T): T => structuredClone(value);

/** A deep-copied draft of an own module. Provider modules cannot be edited, so they throw. */
export const draftFrom = (module: Module, userId: string, now: Date): ModuleDraft => {
  if (module.owner === 'provider') throw new Error('Provider modules cannot be edited; duplicate them first');
  return {
    moduleId: module.id,
    clientId: module.owner.clientId,
    module: clone(module),
    updatedBy: userId,
    updatedAt: now.toISOString(),
  };
};

export const publishVersion = (input: {
  current: Module;
  draft: ModuleDraft;
  now: Date;
}): { module: Module; snapshot: ModuleVersion | null } => {
  const { current, draft, now } = input;
  const neverPublished = current.status === 'draft';
  const version = neverPublished ? current.version : current.version + 1;
  const module: Module = {
    ...clone(draft.module),
    id: current.id,
    owner: current.owner,
    status: 'published',
    version,
    updatedAt: now.toISOString(),
  };
  const snapshot: ModuleVersion | null = neverPublished
    ? null
    : {
        key: `${current.id}:${current.version}`,
        moduleId: current.id,
        version: current.version,
        module: clone(current),
        publishedAt: current.updatedAt ?? now.toISOString(),
      };
  return { module, snapshot };
};

export const duplicateModule = (
  source: Module,
  options: { newId: string; clientId: string; siteId?: string; now: Date },
): Module => ({
  ...clone(source),
  id: options.newId,
  owner:
    options.siteId === undefined
      ? { clientId: options.clientId }
      : { clientId: options.clientId, siteId: options.siteId },
  title: `${source.title} (copy)`,
  status: 'draft',
  version: 1,
  updatedAt: options.now.toISOString(),
  duplicatedFrom: { moduleId: source.id, version: source.version },
});

/** False once anyone has completed the module: Evidence, a passed attempt or a completion event. */
export const canDeleteModule = (input: {
  module: Module;
  evidence: readonly Evidence[];
  attempts: readonly Attempt[];
  events: readonly LearningEvent[];
}): boolean => {
  const id = input.module.id;
  return !(
    input.evidence.some((e) => e.moduleId === id) ||
    input.attempts.some((a) => a.moduleId === id && a.passed === true) ||
    input.events.some((e) => e.type === 'moduleCompleted' && e.moduleId === id)
  );
};

/** People who completed an older version and could be sent the new one, in `people` order. */
export const reassignTargets = (input: {
  module: Module;
  newVersion: number;
  evidence: readonly Evidence[];
  attempts: readonly Attempt[];
  assignments: readonly Assignment[];
  people: readonly Person[];
}): string[] => {
  const { module, newVersion } = input;
  const done = new Map<string, number[]>();
  const note = (personId: string, version: number | undefined): void => {
    done.set(personId, [...(done.get(personId) ?? []), version ?? 1]);
  };
  for (const e of input.evidence) if (e.moduleId === module.id) note(e.personId, e.moduleVersion);
  for (const a of input.attempts) if (a.moduleId === module.id && a.passed === true) note(a.personId, a.moduleVersion);
  const open = new Set(
    input.assignments
      .filter((a) => a.status === 'open' && 'moduleId' in a.target && a.target.moduleId === module.id)
      .map((a) => a.personId),
  );
  return input.people
    .filter((p) => {
      const versions = done.get(p.id);
      return (
        p.status !== 'archived' &&
        versions !== undefined &&
        !open.has(p.id) &&
        versions.some((v) => v < newVersion) &&
        !versions.some((v) => v >= newVersion)
      );
    })
    .map((p) => p.id);
};
