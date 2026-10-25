// Data loading for the learning flow (S4 to S7, certificate). All reads go through the data layer.
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import {
  completedLessonIds,
  overlaysForPerson,
  renewalMonths,
  type Attempt,
  type Client,
  type ClientLinkOverlay,
  type Evidence,
  type LearningEvent,
  type Module,
  type Person,
} from '@sta/domain';
import { useActor, useStore } from '../../app/hooks';

export type LearningData = {
  module: Module;
  person: Person;
  client: Client;
  events: LearningEvent[];
  attempts: Attempt[];
  evidence: Evidence[];
  overlays: ClientLinkOverlay[];
  doneLessons: Set<string>;
  allLessonsDone: boolean;
  renewMonths: number | undefined;
};

export const useModuleId = (): string => useParams()['moduleId'] ?? '';

/** Everything the learning screens need about one module and the signed-in person. */
export function useLearning(moduleId: string) {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: ['learning', actor.userId, moduleId],
    queryFn: async (): Promise<LearningData> => {
      const user = await store.users.get(actor, actor.userId);
      if (!user.personId || !actor.clientId) throw new Error('This account has no person record.');
      const [module, person, client, requirements, allEvents, allAttempts, allEvidence, allOverlays] =
        await Promise.all([
          store.modules.get(actor, moduleId),
          store.people.get(actor, user.personId),
          store.clients.get(actor, actor.clientId),
          store.requirements.list(actor),
          store.learningEvents.list(actor),
          store.attempts.list(actor),
          store.evidence.list(actor),
          store.clientLinkOverlays.list(actor),
        ]);
      const events = allEvents.filter((e) => e.personId === person.id && e.moduleId === module.id);
      const doneLessons = completedLessonIds(module, events, person.id);
      return {
        module,
        person,
        client,
        events,
        attempts: allAttempts.filter(
          (a) => a.personId === person.id && a.moduleId === module.id && a.moduleVersion === module.version,
        ),
        evidence: allEvidence.filter((e) => e.personId === person.id && e.moduleId === module.id),
        overlays: overlaysForPerson(allOverlays, person, module.id),
        doneLessons,
        allLessonsDone: module.lessons.every((l) => doneLessons.has(l.id)),
        renewMonths: renewalMonths(module, requirements),
      };
    },
  });
}
