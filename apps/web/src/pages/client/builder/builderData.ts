// What the Module Builder reads, in one go, through the data layer. Anything a role cannot read is just empty.
import type { ActorContext, DataStore } from '@sta/data';
import type {
  Category,
  ClientLinkOverlay,
  JobRole,
  Module,
  ModuleDraft,
  ModuleVersion,
  Requirement,
} from '@sta/domain';

export type BuilderData = {
  /** The stored module (null for a new one). For an own published module the draft, when there is one, is `draft`. */
  module: Module | null;
  draft: ModuleDraft | null;
  versions: ModuleVersion[];
  requirements: Requirement[];
  jobRoles: JobRole[];
  categories: Category[];
  categoryId: string;
  overlays: ClientLinkOverlay[];
  clientName: string;
};

export async function loadBuilder(
  store: DataStore,
  actor: ActorContext,
  moduleId: string | undefined,
): Promise<BuilderData> {
  const module = moduleId === undefined ? null : await store.modules.get(actor, moduleId);
  const own = module !== null && module.owner !== 'provider';
  const clientId = actor.clientId;
  const [requirements, jobRoles, categories, placements, overlays, draft, versions, client] = await Promise.all([
    store.requirements.list(actor).catch((): Requirement[] => []),
    store.jobRoles.list(actor).catch((): JobRole[] => []),
    store.categories.list(actor).catch((): Category[] => []),
    store.modulePlacements.list(actor).catch(() => []),
    module !== null && !own
      ? store.clientLinkOverlays.list(actor).catch((): ClientLinkOverlay[] => [])
      : Promise.resolve([] as ClientLinkOverlay[]),
    own && module.status === 'published'
      ? store.authoring.drafts.get(actor, module.id).catch(() => null)
      : Promise.resolve(null),
    own ? store.authoring.versions(actor, module.id).catch((): ModuleVersion[] => []) : Promise.resolve([]),
    clientId ? store.clients.get(actor, clientId).catch(() => null) : Promise.resolve(null),
  ]);
  return {
    module,
    draft,
    versions,
    requirements,
    jobRoles,
    categories,
    categoryId: placements.find((p) => module !== null && p.moduleId === module.id)?.categoryId ?? '',
    overlays: overlays.filter((o) => module !== null && o.moduleId === module.id && o.siteId === undefined),
    clientName: client?.displayName ?? 'Our organisation',
  };
}
