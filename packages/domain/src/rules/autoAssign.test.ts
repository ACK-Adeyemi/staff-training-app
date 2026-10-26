// BP-5: auto-assign rules (plan M3 assumptions 25 and 26; brief 21.2).
//
// API under test (rules/autoAssign.ts), all pure; ids for new assignments are the caller's job, so plans carry none.
//   type RuleInput = {
//     rules: AutoAssignRule[]; people: Person[]; requirements: Requirement[]; evidence: Evidence[];
//     assignments: Assignment[]; groups: ModuleGroup[]; now: Date; amberWindowDays: number;
//   }
//   type Trigger = { type: 'personAdded'; personId: string } | { type: 'roleChanged'; personId: string } | { type: 'requirementExpiring' }
//   type Planned = { personId: string; moduleId: string; dueAt: string; source: { ruleId: string } }
//   evaluateAutoAssign(trigger, input) => Planned[]
//     Only enabled rules whose trigger type matches. A filter list matches when any of the person's roles / teams / sites
//     (primary or additional) is in it; no list means everyone. Active people only. A group action expands to one planned
//     assignment per group module. Never planned: a module the person already has an OPEN assignment for (including one
//     planned earlier in the same call by another rule or the same module in a group), or a module that satisfies a
//     requirement the person already has current evidence for that does not expire within the rule's window (amberWindowDays
//     for personAdded and roleChanged, rule.trigger.days for requirementExpiring). Done and cancelled assignments do not block.
//     dueAt = now + dueInDays (London days) for personAdded / roleChanged; for requirementExpiring dueAt = the person's
//     expiry + dueInDays, so dueInDays 0 means "due on the expiry date". requirementExpiring picks people whose Evidence
//     for trigger.requirementId has not yet expired and expires within `days` of now.
//   previewRule(rule, input) => { count: number; personIds: string[] }   the affected-now preview
//     personAdded / roleChanged: matching active people who do not have the module open or current (who would get it if they
//     joined now); requirementExpiring: people inside the window now without an open assignment.
//   ruleSentence(rule, names) => { key: string; params: Record<string, string | number> }
//     names = { jobRoles: Record<id, string>; teams: Record<id, string>; sites: Record<id, string>;
//               modules: Record<id, string>; groups: Record<id, string>; requirements: Record<id, string> }
//     key contains the trigger type ('personAdded' | 'roleChanged' | 'requirementExpiring'); params include
//     role (names joined with ", ", absent with no role filter), site (likewise), training (module or group name),
//     dueInDays, and for requirementExpiring also days and requirement.
import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import type { AutoAssignRule } from '../schemas/admin';
import type { ModuleGroup } from '../schemas/engagement';
import { evaluateAutoAssign, previewRule, ruleSentence } from './autoAssign';
import {
  AMBER,
  CLIENT,
  NOW,
  assignment,
  evidenceExpiring,
  nextId,
  requirement,
  siteNamed,
  staffAt,
} from '../sites/testFixtures';

const riverside = siteNamed('Riverside');
const meadow = siteNamed('Meadow');
const PRACTITIONER = nextId();
const COOK = nextId();
const ROOM = nextId();
const induction = nextId();
const safeguarding = nextId();
const fire = nextId();
const sgReq = requirement('Safeguarding', { satisfiedByModuleIds: [safeguarding], renewEveryMonths: 24 });

const rule = (over: Partial<AutoAssignRule> = {}): AutoAssignRule => ({
  id: nextId(),
  clientId: CLIENT,
  name: 'New starter induction',
  enabled: true,
  trigger: { type: 'personAdded' },
  filters: { jobRoleIds: [PRACTITIONER] },
  action: { moduleId: induction },
  dueInDays: 14,
  ...over,
});

const input = (over: Record<string, unknown> = {}) =>
  ({
    rules: [],
    people: [],
    requirements: [sgReq],
    evidence: [],
    assignments: [],
    groups: [],
    now: NOW,
    amberWindowDays: AMBER,
    ...over,
  }) as never;

const joiner = staffAt(riverside, 'Jo', 'Joiner', { jobRoleIds: [PRACTITIONER] });
const added = (p = joiner) => ({ type: 'personAdded' as const, personId: p.id });

describe('personAdded', () => {
  it('assigns the module with source.ruleId and a due date of now plus dueInDays', () => {
    const r = rule();
    const plan = evaluateAutoAssign(added(), input({ rules: [r], people: [joiner] }));
    expect(plan).toEqual([
      { personId: joiner.id, moduleId: induction, dueAt: addDays(NOW, 14).toISOString(), source: { ruleId: r.id } },
    ]);
  });

  it('ignores disabled rules and rules for another trigger', () => {
    const rules = [rule({ enabled: false }), rule({ trigger: { type: 'roleChanged' } })];
    expect(evaluateAutoAssign(added(), input({ rules, people: [joiner] }))).toEqual([]);
  });

  it('plans nothing for a person who is not in the people list', () => {
    expect(evaluateAutoAssign(added(), input({ rules: [rule()], people: [] }))).toEqual([]);
  });

  it('matches everyone when the rule has no filters', () => {
    const cook = staffAt(riverside, 'Cy', 'Cook', { jobRoleIds: [COOK] });
    const plan = evaluateAutoAssign(added(cook), input({ rules: [rule({ filters: {} })], people: [cook] }));
    expect(plan).toHaveLength(1);
  });
});

describe('filters', () => {
  const cook = staffAt(riverside, 'Cy', 'Cook', {
    jobRoleIds: [COOK],
    teamIds: [ROOM],
    additionalSiteIds: [meadow.id],
  });
  const run = (filters: AutoAssignRule['filters'], p = cook) =>
    evaluateAutoAssign(added(p), input({ rules: [rule({ filters })], people: [p] }));

  it('job role: matches when any of the person roles is listed, not otherwise', () => {
    expect(run({ jobRoleIds: [PRACTITIONER, COOK] })).toHaveLength(1);
    expect(run({ jobRoleIds: [PRACTITIONER] })).toHaveLength(0);
  });

  it('team: matches on any team', () => {
    expect(run({ teamIds: [ROOM] })).toHaveLength(1);
    expect(run({ teamIds: [nextId()] })).toHaveLength(0);
  });

  it('site: matches the primary or an additional site', () => {
    expect(run({ siteIds: [riverside.id] })).toHaveLength(1);
    expect(run({ siteIds: [meadow.id] })).toHaveLength(1);
    expect(run({ siteIds: [nextId()] })).toHaveLength(0);
  });

  it('all lists must match together', () => {
    expect(run({ jobRoleIds: [COOK], siteIds: [nextId()] })).toHaveLength(0);
    expect(run({ jobRoleIds: [COOK], teamIds: [ROOM], siteIds: [meadow.id] })).toHaveLength(1);
  });

  it('an empty list means no restriction', () => {
    expect(run({ jobRoleIds: [] })).toHaveLength(1);
  });
});

describe('roleChanged', () => {
  it('fires only for roleChanged rules', () => {
    const changed = staffAt(riverside, 'Rae', 'Changed', { jobRoleIds: [PRACTITIONER] });
    const r = rule({ trigger: { type: 'roleChanged' }, dueInDays: 7 });
    const trigger = { type: 'roleChanged' as const, personId: changed.id };
    const plan = evaluateAutoAssign(trigger, input({ rules: [r, rule()], people: [changed] }));
    expect(plan).toEqual([
      { personId: changed.id, moduleId: induction, dueAt: addDays(NOW, 7).toISOString(), source: { ruleId: r.id } },
    ]);
  });
});

describe('requirementExpiring', () => {
  const r = rule({
    name: 'Safeguarding refresher',
    trigger: { type: 'requirementExpiring', days: 60, requirementId: sgReq.id },
    filters: {},
    action: { moduleId: safeguarding },
    dueInDays: 0,
  });
  const inWindow = staffAt(riverside, 'Ina', 'Window');
  const later = staffAt(riverside, 'Len', 'Later');
  const expired = staffAt(riverside, 'Ed', 'Expired');
  const never = staffAt(riverside, 'Nia', 'Never');
  const evidence = [
    evidenceExpiring(inWindow, sgReq, 40),
    evidenceExpiring(later, sgReq, 90),
    evidenceExpiring(expired, sgReq, -5),
  ];
  const run = (extra: Record<string, unknown> = {}) =>
    evaluateAutoAssign(
      { type: 'requirementExpiring' },
      input({ rules: [r], people: [inWindow, later, expired, never], evidence, ...extra }),
    );

  it('assigns people whose evidence expires inside the window, due on the expiry date', () => {
    expect(run()).toEqual([
      {
        personId: inWindow.id,
        moduleId: safeguarding,
        dueAt: addDays(NOW, 40).toISOString(),
        source: { ruleId: r.id },
      },
    ]);
  });

  it('assigns nothing to people outside the window', () => {
    expect(run().map((p) => p.personId)).not.toContain(later.id);
  });

  it('is idempotent: running again with the first run assignments in place plans nothing', () => {
    const first = run();
    const made = first.map((p) => assignment(inWindow, p.moduleId, 40, { source: p.source }));
    expect(run({ assignments: made })).toEqual([]);
  });

  it('skips people on leave', () => {
    const away = staffAt(riverside, 'Lee', 'Away', { status: 'onLeave' });
    const plan = evaluateAutoAssign(
      { type: 'requirementExpiring' },
      input({ rules: [r], people: [away], evidence: [evidenceExpiring(away, sgReq, 30)] }),
    );
    expect(plan).toEqual([]);
  });
});

describe('safeguards', () => {
  const run = (extra: Record<string, unknown>) =>
    evaluateAutoAssign(added(), input({ rules: [rule()], people: [joiner], ...extra }));

  it('does not duplicate an open assignment for the same module', () => {
    expect(run({ assignments: [assignment(joiner, induction, 3)] })).toEqual([]);
  });

  it('is not blocked by a done or cancelled assignment', () => {
    expect(run({ assignments: [assignment(joiner, induction, 3, { status: 'done' })] })).toHaveLength(1);
    expect(run({ assignments: [assignment(joiner, induction, 3, { status: 'cancelled' })] })).toHaveLength(1);
  });

  it('a manual open assignment and a rule never produce two open assignments', () => {
    expect(run({ assignments: [assignment(joiner, induction, 3, { source: 'manual' })] })).toEqual([]);
  });

  it('plans a module once when two rules want it in the same call', () => {
    const plan = evaluateAutoAssign(added(), input({ rules: [rule(), rule({ name: 'Second' })], people: [joiner] }));
    expect(plan).toHaveLength(1);
  });

  it('does not assign a module whose requirement is already current', () => {
    const r = rule({ action: { moduleId: safeguarding } });
    const plan = evaluateAutoAssign(
      added(),
      input({ rules: [r], people: [joiner], evidence: [evidenceExpiring(joiner, sgReq, 300)] }),
    );
    expect(plan).toEqual([]);
  });

  it('also counts a requirement the module names itself (module.requirementIds) as already current', () => {
    const r = rule({ action: { moduleId: safeguarding } });
    const bare = { id: safeguarding, requirementIds: [sgReq.id] };
    const plan = evaluateAutoAssign(
      added(),
      input({
        rules: [r],
        people: [joiner],
        modules: [bare],
        requirements: [{ ...sgReq, satisfiedByModuleIds: [] }],
        evidence: [evidenceExpiring(joiner, sgReq, 300)],
      }),
    );
    expect(plan).toEqual([]);
  });

  it('does assign it when the requirement is expiring inside the amber window', () => {
    const r = rule({ action: { moduleId: safeguarding } });
    const plan = evaluateAutoAssign(
      added(),
      input({ rules: [r], people: [joiner], evidence: [evidenceExpiring(joiner, sgReq, 30)] }),
    );
    expect(plan).toHaveLength(1);
  });

  it('does assign it when the requirement has expired', () => {
    const r = rule({ action: { moduleId: safeguarding } });
    const plan = evaluateAutoAssign(
      added(),
      input({ rules: [r], people: [joiner], evidence: [evidenceExpiring(joiner, sgReq, -2)] }),
    );
    expect(plan).toHaveLength(1);
  });

  it.each(['onLeave', 'invited', 'archived'] as const)('skips a person who is %s', (status) => {
    const p = staffAt(riverside, 'Sk', 'Ipped', { jobRoleIds: [PRACTITIONER], status });
    expect(evaluateAutoAssign(added(p), input({ rules: [rule()], people: [p] }))).toEqual([]);
  });
});

describe('group actions', () => {
  const group: ModuleGroup = {
    id: nextId(),
    clientId: CLIENT,
    name: 'Induction pack',
    description: '',
    moduleIds: [induction, fire],
    inOrder: false,
  };
  const r = rule({ action: { groupId: group.id } });

  it('expands to one planned assignment per module, each with the rule as source', () => {
    const plan = evaluateAutoAssign(added(), input({ rules: [r], people: [joiner], groups: [group] }));
    expect(plan.map((p) => p.moduleId).sort()).toEqual([induction, fire].sort());
    expect(plan.every((p) => 'moduleId' in p && p.source.ruleId === r.id)).toBe(true);
  });

  it('skips modules the person already has open', () => {
    const plan = evaluateAutoAssign(
      added(),
      input({ rules: [r], people: [joiner], groups: [group], assignments: [assignment(joiner, fire, 2)] }),
    );
    expect(plan.map((p) => p.moduleId)).toEqual([induction]);
  });

  it('plans nothing for a group that no longer exists', () => {
    expect(evaluateAutoAssign(added(), input({ rules: [r], people: [joiner], groups: [] }))).toEqual([]);
  });
});

describe('previewRule', () => {
  const a = staffAt(riverside, 'Ann', 'A', { jobRoleIds: [PRACTITIONER] });
  const b = staffAt(riverside, 'Bea', 'B', { jobRoleIds: [PRACTITIONER] });
  const c = staffAt(meadow, 'Cat', 'C', { jobRoleIds: [PRACTITIONER] });
  const d = staffAt(riverside, 'Dee', 'D', { jobRoleIds: [COOK] });
  const away = staffAt(riverside, 'Eve', 'E', { jobRoleIds: [PRACTITIONER], status: 'onLeave' });
  const people = [a, b, c, d, away];

  it('counts matching active people without the module open', () => {
    const r = rule();
    const p = previewRule(r, input({ people, assignments: [assignment(a, induction, 3)] }));
    expect(p.personIds.sort()).toEqual([b.id, c.id].sort());
    expect(p.count).toBe(2);
  });

  it('applies the site filter', () => {
    const p = previewRule(rule({ filters: { jobRoleIds: [PRACTITIONER], siteIds: [meadow.id] } }), input({ people }));
    expect(p.personIds).toEqual([c.id]);
  });

  it('leaves out people who are already current for the requirement the module satisfies', () => {
    const r = rule({ action: { moduleId: safeguarding } });
    const p = previewRule(r, input({ people, evidence: [evidenceExpiring(a, sgReq, 300)] }));
    expect(p.personIds).not.toContain(a.id);
    expect(p.count).toBe(2);
  });

  it('for requirementExpiring counts people inside the window without an open assignment', () => {
    const r = rule({
      trigger: { type: 'requirementExpiring', days: 60, requirementId: sgReq.id },
      filters: {},
      action: { moduleId: safeguarding },
      dueInDays: 0,
    });
    const evidence = [evidenceExpiring(a, sgReq, 20), evidenceExpiring(b, sgReq, 50), evidenceExpiring(c, sgReq, 200)];
    const p = previewRule(r, input({ people, evidence, assignments: [assignment(b, safeguarding, 50)] }));
    expect(p.personIds).toEqual([a.id]);
  });

  it('matches what a requirementExpiring run would plan', () => {
    const r = rule({
      trigger: { type: 'requirementExpiring', days: 60, requirementId: sgReq.id },
      filters: {},
      action: { moduleId: safeguarding },
      dueInDays: 0,
    });
    const evidence = [evidenceExpiring(a, sgReq, 20), evidenceExpiring(b, sgReq, 50), evidenceExpiring(c, sgReq, 200)];
    const i = input({ rules: [r], people, evidence });
    const planned = evaluateAutoAssign({ type: 'requirementExpiring' }, i);
    expect(previewRule(r, i).count).toBe(planned.length);
  });
});

describe('ruleSentence', () => {
  const names = {
    jobRoles: { [PRACTITIONER]: 'Practitioner', [COOK]: 'Cook' },
    teams: { [ROOM]: 'Baby room' },
    sites: { [riverside.id]: 'Riverside' },
    modules: { [induction]: 'New starter induction', [safeguarding]: 'Safeguarding and whistleblowing' },
    groups: {},
    requirements: { [sgReq.id]: 'Safeguarding' },
  };

  it('describes a personAdded rule with its role, training and due days', () => {
    const s = ruleSentence(rule(), names);
    expect(s.key).toMatch(/personAdded/);
    expect(s.params).toMatchObject({ role: 'Practitioner', training: 'New starter induction', dueInDays: 14 });
  });

  it('has no site parameter when the rule covers any site, and one when it is limited', () => {
    expect(ruleSentence(rule(), names).params.site).toBeUndefined();
    expect(ruleSentence(rule({ filters: { siteIds: [riverside.id] } }), names).params.site).toBe('Riverside');
  });

  it('joins several roles', () => {
    const s = ruleSentence(rule({ filters: { jobRoleIds: [PRACTITIONER, COOK] } }), names);
    expect(s.params.role).toBe('Practitioner, Cook');
  });

  it('describes a requirementExpiring rule with days, requirement and training', () => {
    const s = ruleSentence(
      rule({
        trigger: { type: 'requirementExpiring', days: 60, requirementId: sgReq.id },
        filters: {},
        action: { moduleId: safeguarding },
        dueInDays: 0,
      }),
      names,
    );
    expect(s.key).toMatch(/requirementExpiring/);
    expect(s.params).toMatchObject({
      days: 60,
      requirement: 'Safeguarding',
      training: 'Safeguarding and whistleblowing',
      dueInDays: 0,
    });
  });

  it('describes a roleChanged rule', () => {
    expect(ruleSentence(rule({ trigger: { type: 'roleChanged' } }), names).key).toMatch(/roleChanged/);
  });

  it('uses the group name for a group action', () => {
    const g = nextId();
    const s = ruleSentence(rule({ action: { groupId: g } }), { ...names, groups: { [g]: 'Induction pack' } });
    expect(s.params.training).toBe('Induction pack');
  });
});
