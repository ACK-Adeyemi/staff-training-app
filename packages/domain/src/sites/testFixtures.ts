// Test-only builders for the multi-site, leaderboard, rule, reminder and calendar tests (M3 chunk 2). Plain data, no behaviour.
import type { ClientView } from '../progress/client';
import type { Person, Site } from '../schemas/tenancy';
import { CLIENT, NOW, AMBER, nextId, person, site } from '../progress/testFixtures';

export {
  CLIENT,
  NOW,
  AMBER,
  nextId,
  person,
  site,
  assignment,
  evidenceExpiring,
  moduleFor,
  requirement,
  submissionWaiting,
} from '../progress/testFixtures';

/** An active site with its own id. */
export const siteNamed = (name: string, over: Partial<Site> = {}): Site => site({ id: nextId(), name, ...over });

/** A person whose primary site is `s`. */
export const staffAt = (s: Site, first: string, last: string, over: Partial<Person> = {}): Person =>
  person(first, last, { primarySiteId: s.id, ...over });

export const clientView = (over: Partial<ClientView> = {}): ClientView => ({
  people: [],
  sites: [],
  requirements: [],
  evidence: [],
  submissions: [],
  now: NOW,
  amberWindowDays: AMBER,
  ...over,
});

export const otherClientId = (): string => `01HZX${'9'.repeat(21)}`;
export { CLIENT as THIS_CLIENT };
