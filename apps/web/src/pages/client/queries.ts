// Data loading for the client screens. All reads go through the data layer; rules live in the domain package.
import { useQuery } from '@tanstack/react-query';
import { ForbiddenError } from '@sta/data';
import {
  londonDateString,
  type Assignment,
  type ClientView,
  type EffectivePermission,
  type Module,
  type Person,
} from '@sta/domain';
import { useActor, useClock, useStore } from '../../app/hooks';

export type ClientData = {
  view: ClientView;
  assignments: Assignment[];
  modules: Module[];
  accountState: string;
};

/** A read the role may not have: the screen shows nothing for it rather than failing. Other errors still fail. */
export const orEmpty = <T>(read: Promise<T[]>): Promise<T[]> =>
  read.catch((e: unknown) => {
    if (e instanceof ForbiddenError) return [];
    throw e;
  });

/** Everything the dashboard, people list and person record need, in the actor's read scope. */
export function useClientData() {
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  const now = clock.now();
  return useQuery({
    queryKey: ['clientData', actor.userId, londonDateString(now)],
    queryFn: async (): Promise<ClientData> => {
      if (!actor.clientId) throw new Error('This account has no client.');
      const [client, people, sites, requirements, evidence, submissions, assignments, modules] = await Promise.all([
        store.clients.get(actor, actor.clientId),
        store.people.list(actor),
        store.sites.list(actor),
        store.requirements.list(actor),
        orEmpty(store.evidence.list(actor)),
        orEmpty(store.evidenceSubmissions.list(actor)),
        orEmpty(store.assignments.list(actor)),
        store.modules.list(actor),
      ]);
      return {
        view: {
          people,
          sites,
          requirements,
          evidence,
          submissions,
          now,
          amberWindowDays: client.settings.amberWindowDays,
        },
        assignments,
        modules,
        accountState: client.accountState,
      };
    },
  });
}

/** The signed-in user's effective permissions. Anything that cannot be read counts as no permissions. */
export function usePermissions() {
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  const now = clock.now();
  return useQuery({
    queryKey: ['permissions', actor.userId, londonDateString(now)],
    queryFn: async (): Promise<EffectivePermission[]> => {
      try {
        return await store.access.permissions(actor);
      } catch {
        return [];
      }
    },
  });
}

export const fullName = (p: Pick<Person, 'firstName' | 'lastName'>): string => `${p.firstName} ${p.lastName}`;

export function moduleTitleOf(modules: Module[], a: Assignment): string {
  const target = a.target;
  if (!('moduleId' in target)) return '';
  return modules.find((m) => m.id === target.moduleId)?.title ?? '';
}
