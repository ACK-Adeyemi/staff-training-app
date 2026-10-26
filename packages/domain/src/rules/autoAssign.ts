// Auto-assign rules (brief 21.2; plan M3 assumptions 25 and 26). Pure: the caller creates the assignments and gives them ids.
// requirementExpiring: dueAt is the person's expiry plus dueInDays, so 0 means "due on the expiry date" (docs/decisions.md, M3 chunk 2).
import { addDays } from '../dates';
import { requirementStatus } from '../requirements';
import type { AutoAssignRule } from '../schemas/admin';
import type { Evidence } from '../schemas/evidence';
import type { Assignment } from '../schemas/learning';
import type { ModuleGroup } from '../schemas/engagement';
import type { Requirement } from '../schemas/packs';
import type { Person } from '../schemas/tenancy';

export type RuleInput = {
  rules: AutoAssignRule[];
  people: Person[];
  requirements: Requirement[];
  evidence: Evidence[];
  assignments: Assignment[];
  groups: ModuleGroup[];
  now: Date;
  amberWindowDays: number;
};

export type Trigger =
  | { type: 'personAdded'; personId: string }
  | { type: 'roleChanged'; personId: string }
  | { type: 'requirementExpiring' };

export type Planned = { personId: string; moduleId: string; dueAt: string; source: { ruleId: string } };

const matches = (list: string[] | undefined, have: string[]): boolean =>
  list === undefined || list.length === 0 || have.some((id) => list.includes(id));

export const ruleMatchesPerson = (rule: AutoAssignRule, p: Person): boolean =>
  p.status === 'active' &&
  matches(rule.filters.jobRoleIds, p.jobRoleIds) &&
  matches(rule.filters.teamIds, p.teamIds) &&
  matches(rule.filters.siteIds, [p.primarySiteId, ...p.additionalSiteIds]);

const moduleIdsOf = (rule: AutoAssignRule, groups: ModuleGroup[]): string[] =>
  'moduleId' in rule.action
    ? [rule.action.moduleId]
    : (groups.find((g) => g.id === (rule.action as { groupId: string }).groupId)?.moduleIds ?? []);

/** Plans for one rule and one person; `taken` holds person|module pairs already open or planned. */
function planPerson(rule: AutoAssignRule, p: Person, input: RuleInput, taken: Set<string>): Planned[] {
  if (!ruleMatchesPerson(rule, p)) return [];
  const mine = input.evidence.filter((e) => e.personId === p.id);
  let dueAt: string;
  let window = input.amberWindowDays;
  if (rule.trigger.type === 'requirementExpiring') {
    const req = input.requirements.find((r) => r.id === (rule.trigger as { requirementId: string }).requirementId);
    if (!req) return [];
    const days = rule.trigger.days;
    const s = requirementStatus(req, mine, [], input.now, days);
    if (s.status !== 'expiringSoon' || !s.expiresAt) return [];
    dueAt = addDays(new Date(s.expiresAt), rule.dueInDays).toISOString();
    window = days;
  } else {
    dueAt = addDays(input.now, rule.dueInDays).toISOString();
  }
  const out: Planned[] = [];
  for (const moduleId of moduleIdsOf(rule, input.groups)) {
    const key = `${p.id}|${moduleId}`;
    if (taken.has(key)) continue;
    const alreadyCurrent = input.requirements
      .filter((r) => r.satisfiedByModuleIds.includes(moduleId))
      .some((r) => requirementStatus(r, mine, [], input.now, window).status === 'current');
    if (alreadyCurrent) continue;
    taken.add(key);
    out.push({ personId: p.id, moduleId, dueAt, source: { ruleId: rule.id } });
  }
  return out;
}

const openPairs = (assignments: Assignment[]): Set<string> =>
  new Set(
    assignments
      .filter((a) => a.status === 'open' && 'moduleId' in a.target)
      .map((a) => `${a.personId}|${(a.target as { moduleId: string }).moduleId}`),
  );

export function evaluateAutoAssign(trigger: Trigger, input: RuleInput): Planned[] {
  const taken = openPairs(input.assignments);
  const out: Planned[] = [];
  for (const rule of input.rules) {
    if (!rule.enabled || rule.trigger.type !== trigger.type) continue;
    const people =
      trigger.type === 'requirementExpiring' ? input.people : input.people.filter((p) => p.id === trigger.personId);
    for (const p of people) out.push(...planPerson(rule, p, input, taken));
  }
  return out;
}

/** Who a rule would affect now: matching active people who would get something planned. */
export function previewRule(rule: AutoAssignRule, input: RuleInput): { count: number; personIds: string[] } {
  const taken = openPairs(input.assignments);
  const ids = new Set<string>();
  for (const p of input.people) if (planPerson(rule, p, input, taken).length > 0) ids.add(p.id);
  return { count: ids.size, personIds: [...ids] };
}

export type RuleNames = {
  jobRoles: Record<string, string>;
  teams: Record<string, string>;
  sites: Record<string, string>;
  modules: Record<string, string>;
  groups: Record<string, string>;
  requirements: Record<string, string>;
};

const join = (ids: string[] | undefined, names: Record<string, string>): string | undefined =>
  ids && ids.length > 0 ? ids.map((id) => names[id] ?? id).join(', ') : undefined;

/** The plain-English sentence as a language key plus parameters; the UI fills in the words. */
export function ruleSentence(
  rule: AutoAssignRule,
  names: RuleNames,
): { key: string; params: Record<string, string | number> } {
  const params: Record<string, string | number> = { dueInDays: rule.dueInDays };
  const role = join(rule.filters.jobRoleIds, names.jobRoles);
  const team = join(rule.filters.teamIds, names.teams);
  const site = join(rule.filters.siteIds, names.sites);
  if (role) params.role = role;
  if (team) params.team = team;
  if (site) params.site = site;
  params.training =
    'moduleId' in rule.action
      ? (names.modules[rule.action.moduleId] ?? rule.action.moduleId)
      : (names.groups[rule.action.groupId] ?? rule.action.groupId);
  if (rule.trigger.type === 'requirementExpiring') {
    params.days = rule.trigger.days;
    params.requirement = names.requirements[rule.trigger.requirementId] ?? rule.trigger.requirementId;
  }
  return { key: `rules.sentence.${rule.trigger.type}`, params };
}
