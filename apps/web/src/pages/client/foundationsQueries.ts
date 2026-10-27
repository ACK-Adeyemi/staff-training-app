// Data loading for the client foundations screens (two-step sign-in, account state, team, settings, onboarding).
import { useQuery } from '@tanstack/react-query';
import { londonDateString } from '@sta/domain';
import { ForbiddenError } from '@sta/data';
import { useActor, useClock, useStore } from '../../app/hooks';

/** A key that changes with the person and the demo day, so Fast-forward and persona changes show straight away. */
function useScopeKey(name: string): string[] {
  const actor = useActor();
  const clock = useClock();
  return [name, actor.userId, actor.clientId ?? '', londonDateString(clock.now())];
}

export function useTwoFactorStatus() {
  const store = useStore();
  const actor = useActor();
  return useQuery({ queryKey: useScopeKey('twoFactor'), queryFn: () => store.twoFactor.status(actor) });
}

export function useAccountStatus() {
  const store = useStore();
  const actor = useActor();
  return useQuery({ queryKey: useScopeKey('accountStatus'), queryFn: () => store.account.status(actor) });
}

export function useSites() {
  const store = useStore();
  const actor = useActor();
  return useQuery({ queryKey: useScopeKey('sitesList'), queryFn: () => store.sites.list(actor) });
}

export function useOnboarding() {
  const store = useStore();
  const actor = useActor();
  return useQuery({ queryKey: useScopeKey('onboarding'), queryFn: () => store.onboarding.checklist(actor) });
}

/** The organisation record (name, name history, settings) for the signed-in admin. */
export function useOrganisation() {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: useScopeKey('organisation'),
    queryFn: async () => {
      if (!actor.clientId) throw new ForbiddenError('permission');
      return store.clients.get(actor, actor.clientId);
    },
  });
}

/** `canSeeActivity` is undefined until the person's permissions are known; nothing loads before then. */
export function useTeam(canSeeActivity: boolean | undefined) {
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  const key = useScopeKey('team');
  return useQuery({
    queryKey: [...key, canSeeActivity ?? null],
    enabled: canSeeActivity !== undefined,
    queryFn: async () => {
      const [members, roles, users, sites, activity] = await Promise.all([
        store.team.members(actor),
        store.roles.list(actor),
        store.users.list(actor).catch(() => []),
        store.sites.list(actor).catch(() => []),
        canSeeActivity ? store.team.activity(actor) : Promise.resolve([]),
      ]);
      return { members, roles, users, sites, activity, now: clock.now() };
    },
  });
}
