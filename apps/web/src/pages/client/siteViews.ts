// Multi-site helpers for the client pages: the data narrowed to the site chosen in the switcher, and the events the
// site comparison needs. Rules live in the domain package (sites/rollup.ts); this only wires them to the screens.
import { useQuery } from '@tanstack/react-query';
import { viewForSite, type Assignment, type ClientView, type LearningEvent, type Person } from '@sta/domain';
import { useActor, useClock, useStore } from '../../app/hooks';
import { orEmpty, type ClientData } from './queries';

export type ScopedClientData = {
  view: ClientView;
  assignments: Assignment[];
  /** People from other primary sites who also work at the chosen site. Empty on All sites. */
  alsoWorksHere: Person[];
};

/** The organisation data narrowed to one site's people (by primary site), or untouched for 'all'. */
export function scopeClientData(data: ClientData, site: string): ScopedClientData {
  const scoped = viewForSite({ ...data.view, assignments: data.assignments, events: [] }, site);
  const view: ClientView = {
    people: scoped.people,
    sites: scoped.sites,
    requirements: scoped.requirements,
    evidence: scoped.evidence,
    submissions: scoped.submissions,
    now: scoped.now,
    amberWindowDays: scoped.amberWindowDays,
  };
  return { view, assignments: scoped.assignments, alsoWorksHere: scoped.alsoWorksHere };
}

/** Learning events in the actor's read scope, for the completion figure on the site comparison. */
export function useSiteEvents(enabled: boolean) {
  const store = useStore();
  const actor = useActor();
  const day = useClock().now().toISOString().slice(0, 10);
  return useQuery({
    queryKey: ['siteEvents', actor.userId, day],
    queryFn: (): Promise<LearningEvent[]> => orEmpty(store.learningEvents.list(actor)),
    enabled,
  });
}
