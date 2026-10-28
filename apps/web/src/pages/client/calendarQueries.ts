// Data loading for C28 Calendar. Reads go through the data layer. Anything the role may not read is left empty, and
// billing dates are only read for someone who holds billing.view (the domain adds them only when given billing data).
import { useQuery } from '@tanstack/react-query';
import { ForbiddenError } from '@sta/data';
import {
  holdsAnywhere,
  londonDateString,
  type Assignment,
  type AutoAssignRule,
  type Billing,
  type Competition,
  type Evidence,
  type EvidenceSubmission,
  type Module,
  type Person,
  type Requirement,
  type Site,
  type Team,
  type Theme,
} from '@sta/domain';
import { useActor, useClock, useStore } from '../../app/hooks';
import { orEmpty, usePermissions } from './queries';

export type ClientCalendarData = {
  people: Person[];
  sites: Site[];
  teams: Team[];
  requirements: Requirement[];
  evidence: Evidence[];
  submissions: EvidenceSubmission[];
  assignments: Assignment[];
  modules: Module[];
  competitions: Competition[];
  rules: AutoAssignRule[];
  themes: Theme[];
  amberWindowDays: number;
  firstAiderThreshold: number;
  billing?: Billing;
};

export function useClientCalendar() {
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  const perms = usePermissions();
  const hasBilling = perms.data ? holdsAnywhere(perms.data, 'billing.view') : false;
  return useQuery({
    queryKey: ['clientCalendar', actor.userId, londonDateString(clock.now()), hasBilling],
    enabled: perms.data !== undefined,
    queryFn: async (): Promise<ClientCalendarData> => {
      if (!actor.clientId) throw new Error('This account has no client.');
      const [client, people, sites, teams, requirements, evidence, submissions, assignments, modules] =
        await Promise.all([
          store.clients.get(actor, actor.clientId),
          store.people.list(actor),
          store.sites.list(actor),
          orEmpty(store.teams.list(actor)),
          store.requirements.list(actor),
          orEmpty(store.evidence.list(actor)),
          orEmpty(store.evidenceSubmissions.list(actor)),
          orEmpty(store.assignments.list(actor)),
          store.modules.list(actor),
        ]);
      const [competitions, rules, themes] = await Promise.all([
        orEmpty(store.competitions.list(actor)),
        orEmpty(store.autoAssign.list(actor)),
        orEmpty(store.themes.list(actor)),
      ]);
      const billing = hasBilling ? await readBilling() : undefined;
      return {
        people,
        sites,
        teams,
        requirements,
        evidence,
        submissions,
        assignments,
        modules,
        competitions,
        rules,
        themes,
        amberWindowDays: client.settings.amberWindowDays,
        firstAiderThreshold: client.settings.firstAiderThreshold,
        ...(billing ? { billing } : {}),
      };

      async function readBilling(): Promise<Billing | undefined> {
        try {
          const [overview, invoices, addOns, account] = await Promise.all([
            store.billing.overview(actor),
            store.billing.invoices(actor),
            store.addOns.list(actor),
            store.account.status(actor),
          ]);
          return {
            renewalAt: overview.renewalAt,
            invoices: invoices
              .filter((i) => i.status === 'due' || i.status === 'overdue')
              .map((i) => ({ id: i.id, dueAt: i.dueAt, status: 'open' as const })),
            addOnTrials: addOns
              .filter((a) => a.status === 'trial' && a.endsAt !== undefined)
              .map((a) => ({ addOnId: a.addOnId, endsAt: a.endsAt ?? '' })),
            ...(account.nextChange
              ? { nextStateChange: { at: account.nextChange.at, state: account.nextChange.state } }
              : {}),
          };
        } catch (e) {
          if (e instanceof ForbiddenError) return undefined;
          throw e;
        }
      }
    },
  });
}
