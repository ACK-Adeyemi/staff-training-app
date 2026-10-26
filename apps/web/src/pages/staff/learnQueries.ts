// Data loading for Learn (S3): the visible modules with required marking, status, category and groups.
import { useQuery } from '@tanstack/react-query';
import { learnCatalogue, londonDateString, type CatalogueRow, type Category, type ModuleGroup } from '@sta/domain';
import { useActor, useClock, useStore } from '../../app/hooks';

export type LearnCatalogue = { rows: CatalogueRow[]; categories: Category[]; groups: ModuleGroup[]; packId: string };

export function useLearnCatalogue() {
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  const now = clock.now();
  return useQuery({
    queryKey: ['learnCatalogue', actor.userId, londonDateString(now)],
    queryFn: async (): Promise<LearnCatalogue> => {
      const user = await store.users.get(actor, actor.userId);
      if (!user.personId || !actor.clientId) throw new Error('This account has no person record.');
      const [
        person,
        client,
        requirements,
        evidence,
        submissions,
        assignments,
        modules,
        events,
        placements,
        cats,
        groups,
      ] = await Promise.all([
        store.people.get(actor, user.personId),
        store.clients.get(actor, actor.clientId),
        store.requirements.list(actor),
        store.evidence.list(actor),
        store.evidenceSubmissions.list(actor),
        store.assignments.list(actor),
        store.modules.list(actor),
        store.learningEvents.list(actor),
        store.modulePlacements.list(actor),
        store.categories.list(actor),
        store.moduleGroups.list(actor),
      ]);
      const site = await store.sites.get(actor, person.primarySiteId);
      const categories = [...cats].sort((a, b) => a.order - b.order);
      const rows = learnCatalogue({
        person,
        site,
        modules,
        requirements,
        evidence,
        submissions,
        assignments,
        events,
        placements,
        categories,
        groups,
        now,
        amberWindowDays: client.settings.amberWindowDays,
      });
      return { rows, categories, groups, packId: client.industryPackId };
    },
  });
}
