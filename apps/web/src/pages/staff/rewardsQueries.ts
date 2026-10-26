// Data loading for the rewards screens (S2 weekly goal and badge, S7 XP and badges, S8 history and XP).
// Everything is derived from the person's own history through the data layer and the domain functions. Nothing is stored.
import { useQuery } from '@tanstack/react-query';
import { badgeDefinitions, levelConfig } from '@sta/content';
import {
  earnedBadges,
  levelFor,
  weeklyGoal,
  xpLedger,
  xpTotal,
  type Assignment,
  type Attempt,
  type Client,
  type Competition,
  type Evidence,
  type EarnedBadgeRow,
  type LearningEvent,
  type LevelInfo,
  type Module,
  type Person,
  type Requirement,
  type Site,
  type WeeklyGoal,
  type XpLedgerEntry,
  type BadgeDefinition,
  type EvidenceSubmission,
} from '@sta/domain';
import { useActor, useClock, useStore } from '../../app/hooks';

export type RewardsData = {
  person: Person;
  site: Site;
  client: Client;
  modules: Module[];
  requirements: Requirement[];
  assignments: Assignment[];
  submissions: EvidenceSubmission[];
  /** All of this person's evidence. */
  evidence: Evidence[];
  events: LearningEvent[];
  attempts: Attempt[];
  competitions: Competition[];
  ledger: XpLedgerEntry[];
  totalXp: number;
  level: LevelInfo;
  badges: EarnedBadgeRow[];
  goal: WeeklyGoal;
};

/** The badge definition for an earned badge id (mastery ids look like `mastery:<moduleId>`). */
export const badgeDefinitionFor = (badgeId: string) => {
  const base = badgeId.split(':')[0];
  return badgeDefinitions.find((d) => d.id === base);
};

export function useRewards() {
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  return useQuery({
    queryKey: ['rewards', actor.userId, clock.now().toISOString().slice(0, 10)],
    queryFn: async (): Promise<RewardsData> => {
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
        attempts,
        competitions,
      ] = await Promise.all([
        store.people.get(actor, user.personId),
        store.clients.get(actor, actor.clientId),
        store.requirements.list(actor),
        store.evidence.list(actor),
        store.evidenceSubmissions.list(actor),
        store.assignments.list(actor),
        store.modules.list(actor),
        store.learningEvents.list(actor),
        store.attempts.list(actor),
        store.competitions.list(actor),
      ]);
      const site = await store.sites.get(actor, person.primarySiteId);
      const myEvents = events.filter((e) => e.personId === person.id);
      const myEvidence = evidence.filter((e) => e.personId === person.id);
      const myAttempts = attempts.filter((a) => a.personId === person.id);
      const ledger = xpLedger({
        events: myEvents,
        attempts: myAttempts,
        modules,
        evidence: myEvidence,
        requirements,
        weeklyGoalLessons: client.settings.weeklyGoalLessons,
        personId: person.id,
      });
      const totalXp = xpTotal(ledger);
      const badges = earnedBadges({
        definitions: badgeDefinitions as BadgeDefinition[],
        events: myEvents,
        attempts: myAttempts,
        modules,
        evidence: myEvidence,
        requirements,
        competitions,
        person,
        site,
      });
      return {
        person,
        site,
        client,
        modules,
        requirements,
        assignments: assignments.filter((a) => a.personId === person.id),
        submissions: submissions.filter((s) => s.personId === person.id),
        evidence: myEvidence,
        events: myEvents,
        attempts: myAttempts,
        competitions,
        ledger,
        totalXp,
        level: levelFor(totalXp, levelConfig.thresholds, levelConfig.stepAfterTable),
        badges,
        goal: weeklyGoal({
          events: myEvents,
          goal: client.settings.weeklyGoalLessons,
          now: clock.now(),
          person,
        }),
      };
    },
  });
}

/**
 * The most recently earned badge. When several were earned at the same instant, the one listed first in the
 * badge definitions wins, because the list runs from the main achievements to the smaller ones.
 */
export function latestBadge(badges: readonly EarnedBadgeRow[]): EarnedBadgeRow | undefined {
  const order = (b: EarnedBadgeRow): number => badgeDefinitions.findIndex((d) => d.id === b.badgeId.split(':')[0]);
  let best: EarnedBadgeRow | undefined;
  for (const b of badges) {
    if (!best) best = b;
    else {
      const later = new Date(b.at).getTime() - new Date(best.at).getTime();
      if (later > 0 || (later === 0 && order(b) < order(best))) best = b;
    }
  }
  return best;
}
