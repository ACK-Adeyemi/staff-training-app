// Data loading for the staff screens. All reads go through the data layer; rules live in the domain package.
import { useQuery } from '@tanstack/react-query';
import { londonDateString, staffSummary, type StaffSummary } from '@sta/domain';
import type { Assignment, Evidence, Module, Notification } from '@sta/domain';
import { useActor, useClock, useStore } from '../../app/hooks';

export type StaffData = {
  summary: StaffSummary;
  modules: Module[];
  personName: string;
  evidence: Evidence[];
  assignments: Assignment[];
};

/** The signed-in person's summary: ring, rows, next up and coming up. Refreshes on store changes and on a new day. */
export function useStaffData() {
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  const now = clock.now();
  return useQuery({
    queryKey: ['staffData', actor.userId, londonDateString(now)],
    queryFn: async (): Promise<StaffData> => {
      const user = await store.users.get(actor, actor.userId);
      if (!user.personId || !actor.clientId) throw new Error('This account has no person record.');
      const [person, client, requirements, evidence, submissions, assignments, modules] = await Promise.all([
        store.people.get(actor, user.personId),
        store.clients.get(actor, actor.clientId),
        store.requirements.list(actor),
        store.evidence.list(actor),
        store.evidenceSubmissions.list(actor),
        store.assignments.list(actor),
        store.modules.list(actor),
      ]);
      const site = await store.sites.get(actor, person.primarySiteId);
      const summary = staffSummary({
        person,
        site,
        requirements,
        evidence,
        submissions,
        assignments,
        modules,
        now,
        amberWindowDays: client.settings.amberWindowDays,
      });
      return {
        summary,
        modules,
        personName: person.nickname ?? person.firstName,
        evidence: evidence.filter((e) => e.personId === person.id),
        assignments: assignments.filter((a) => a.personId === person.id),
      };
    },
  });
}

export function useNotifications(enabled = true) {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: ['notifications', actor.userId],
    queryFn: (): Promise<Notification[]> => store.notifications.list(actor),
    enabled,
  });
}

/** Unread notifications for the shell bell. Errors count as none, so the shell never breaks. */
export function useUnreadCount(enabled: boolean): number {
  const q = useNotifications(enabled);
  return q.data?.filter((n) => n.readAt === undefined).length ?? 0;
}
