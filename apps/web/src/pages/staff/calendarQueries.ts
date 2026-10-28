// Data loading for S18 Calendar. Reads go through the data layer; the items come from the domain `calendarItems`.
import { useQuery } from '@tanstack/react-query';
import { ForbiddenError } from '@sta/data';
import { londonDateString, type Competition, type Person, type Site } from '@sta/domain';
import type { Assignment, Evidence, EvidenceSubmission, Module, Requirement } from '@sta/domain';
import { useActor, useClock, useStore } from '../../app/hooks';

export type StaffCalendarData = {
  person: Person;
  site: Site;
  requirements: Requirement[];
  evidence: Evidence[];
  submissions: EvidenceSubmission[];
  assignments: Assignment[];
  modules: Module[];
  competitions: Competition[];
  amberWindowDays: number;
};

export function useStaffCalendar() {
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  return useQuery({
    queryKey: ['staffCalendar', actor.userId, londonDateString(clock.now())],
    queryFn: async (): Promise<StaffCalendarData> => {
      const user = await store.users.get(actor, actor.userId);
      if (!user.personId || !actor.clientId) throw new Error('This account has no person record.');
      const [person, client, requirements, evidence, submissions, assignments, modules, competitions] =
        await Promise.all([
          store.people.get(actor, user.personId),
          store.clients.get(actor, actor.clientId),
          store.requirements.list(actor),
          store.evidence.list(actor),
          store.evidenceSubmissions.list(actor),
          store.assignments.list(actor),
          store.modules.list(actor),
          store.competitions.list(actor).catch((e: unknown) => {
            if (e instanceof ForbiddenError) return [];
            throw e;
          }),
        ]);
      const site = await store.sites.get(actor, person.primarySiteId);
      return {
        person,
        site,
        requirements,
        evidence,
        submissions,
        assignments,
        modules,
        competitions,
        amberWindowDays: client.settings.amberWindowDays,
      };
    },
  });
}
