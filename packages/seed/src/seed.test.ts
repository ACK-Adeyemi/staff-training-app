// Chunk 8 (F-3): the seed matches build pack 7 for M0 scope. Plan "Seed tests".
import { describe, expect, it } from 'vitest';
import {
  accountStateAt,
  addDays,
  addMonths,
  clientRoleTemplates,
  clientSchema,
  daysBetween,
  evidenceSchema,
  evidenceSubmissionSchema,
  jobRoleSchema,
  mondayOfWeek,
  nextTransition,
  paymentAttemptSchema,
  personRequirementStatus,
  personSchema,
  requirementSchema,
  roleAssignmentSchema,
  roleSchema,
  siteSchema,
  subscriptionSchema,
  teamSchema,
  userAccountSchema,
  type DunningPolicy,
  type Evidence,
  type EvidenceSubmission,
  type Person,
  type RequirementStatusName,
} from '@sta/domain';
import { allPacks, nurseryPack, packageIds } from '@sta/content';
import { londonParts, seeded, TODAY, type Dump } from './testing';

const NOW = new Date(TODAY);
const POLICY: DunningPolicy = {
  graceDays: 14,
  limitedUntilDay: 30,
  readOnlyUntilDay: 60,
  closedUntilDay: 150,
  deleteWithinDays: 30,
};

const schemaByStore: Record<string, { parse(v: unknown): unknown }> = {
  clients: clientSchema,
  sites: siteSchema,
  teams: teamSchema,
  people: personSchema,
  users: userAccountSchema,
  jobRoles: jobRoleSchema,
  requirements: requirementSchema,
  evidence: evidenceSchema,
  evidenceSubmissions: evidenceSubmissionSchema,
  roles: roleSchema,
  roleAssignments: roleAssignmentSchema,
  subscriptions: subscriptionSchema,
  paymentAttempts: paymentAttemptSchema,
};

const byName = (dump: Dump, clientId: string, first: string): Person => {
  const p = (dump['people'] as Person[]).find((x) => x.clientId === clientId && x.firstName === first);
  if (!p) throw new Error(`No person ${first}`);
  return p;
};

async function statusesFor(dump: Dump, personId: string, now = NOW) {
  const person = (dump['people'] as Person[]).find((p) => p.id === personId)!;
  const site = dump['sites'].find((s) => s.id === person.primarySiteId);
  const client = dump['clients'].find((c) => c.id === person.clientId);
  const evidence = (dump['evidence'] as Evidence[]).filter((e) => e.personId === personId);
  const subs = (dump['evidenceSubmissions'] as EvidenceSubmission[]).filter((s) => s.personId === personId);
  const out: Record<string, { status: RequirementStatusName; daysLeft?: number; expiresAt?: string }> = {};
  for (const r of dump['requirements'] as (typeof nurseryPack.requirements)[number][]) {
    out[r.name] = personRequirementStatus(r, person, site, evidence, subs, now, client.settings.amberWindowDays);
  }
  return out;
}

describe('seed: provider (7.1)', () => {
  it('has the five-person provider team with the stated names and fictional .test emails', async () => {
    const { dump, keys } = await seeded();
    const provider = dump['users'].filter((u) => u.side === 'provider');
    expect(provider.map((u) => u.displayName).sort()).toEqual(['Megan', 'Owner', 'Raj', 'Sophie', 'Tom']);
    expect(provider.find((u) => u.id === keys.users['providerOwner'])).toMatchObject({
      displayName: 'Owner',
      email: 'owner@example.test',
    });
    for (const u of provider) {
      expect(u.clientId).toBeUndefined();
      expect(u.email).toMatch(/\.test$/);
    }
  });

  it('gives Tom no 2FA enrolment and the others an enrolment (mixed states)', async () => {
    const { dump, keys } = await seeded();
    const get = (k: string) => dump['users'].find((u) => u.id === keys.users[k])!;
    expect(get('tom').twoFactor).toBeUndefined();
    for (const k of ['providerOwner', 'sophie', 'raj', 'megan']) expect(get(k).twoFactor).toBeDefined();
  });

  it('gives each provider user a role assignment, and a custom provider role Account manager', async () => {
    const { dump, keys } = await seeded();
    for (const k of ['providerOwner', 'sophie', 'raj', 'megan', 'tom']) {
      expect(dump['roleAssignments'].some((a) => a.userId === keys.users[k])).toBe(true);
    }
    const custom = dump['roles'].find((r) => r.owner === 'provider' && r.name === 'Account manager');
    expect(custom).toBeDefined();
    expect(custom.system).toBe(false);
  });
});

describe('seed: clients (7.2)', () => {
  it('has 13 clients with the stated packages, packs and account states', async () => {
    const { dump, keys } = await seeded();
    expect(dump['clients']).toHaveLength(13);
    const packName = (id: string) => allPacks.find((p) => p.id === id)?.name;
    const c = (k: string) => dump['clients'].find((x) => x.id === keys.clients[k])!;
    const expected: Record<string, [string, string | undefined, string]> = {
      littleAcorns: ['Little Acorns Nursery', packageIds.standard, 'active'],
      oakTree: ['Oak Tree Nurseries', packageIds.group, 'active'],
      willowLane: ['Willow Lane Nursery', packageIds.essentials, 'pastDue'],
      maisonElvaro: ['Maison Elvaro', packageIds.group, 'active'],
      brookfield: ['Brookfield Primary School', packageIds.standard, 'active'],
      rosewood: ['Rosewood Care Home', undefined, 'trial'],
      harbourCafe: ['Harbour Cafe Group', undefined, 'active'],
      atelierVasquine: ['Atelier Vasquine', undefined, 'trial'],
      summitBuilders: ['Summit Builders', packageIds.essentials, 'active'],
      sunnyDays: ['Sunny Days Pre-school', undefined, 'limited'],
      littleStars: ['Little Stars Day Nursery', undefined, 'readOnly'],
      meadowview: ['Meadowview Nursery', undefined, 'closed'],
      pebbles: ['Pebbles Childcare', undefined, 'paused'],
    };
    expect(Object.keys(keys.clients).sort()).toEqual(Object.keys(expected).sort());
    for (const [k, [name, pkg, state]] of Object.entries(expected)) {
      expect(c(k).displayName).toBe(name);
      expect(c(k).accountState).toBe(state);
      if (pkg) expect(c(k).packageId).toBe(pkg);
    }
    expect(packName(c('brookfield').industryPackId)).toBe('Schools');
    expect(packName(c('rosewood').industryPackId)).toBe('Social care');
    expect(packName(c('harbourCafe').industryPackId)).toBe('Hospitality');
    expect(packName(c('summitBuilders').industryPackId)).toBe('Construction');
    expect(packName(c('maisonElvaro').industryPackId)).toBe('Luxury retail');
    expect(packName(c('atelierVasquine').industryPackId)).toBe('Luxury retail');
    for (const k of ['littleAcorns', 'oakTree', 'willowLane', 'sunnyDays', 'littleStars', 'meadowview', 'pebbles']) {
      expect(c(k).industryPackId).toBe(nurseryPack.id);
    }
  });

  it('has one Subscription per client and its dunning state matches the client state at today', async () => {
    const { dump } = await seeded();
    expect(dump['subscriptions']).toHaveLength(13);
    for (const client of dump['clients']) {
      const sub = dump['subscriptions'].find((s) => s.clientId === client.id);
      expect(sub, client.displayName).toBeDefined();
      expect(sub.state).toBe(client.accountState);
      const payments = dump['paymentAttempts'].filter((p) => p.clientId === client.id);
      expect(accountStateAt(sub, payments, POLICY, NOW), client.displayName).toBe(client.accountState);
    }
  });

  it('places the summary clients on the stated day of their state', async () => {
    const { dump, keys } = await seeded();
    const sub = (k: string) => dump['subscriptions'].find((s) => s.clientId === keys.clients[k])!;
    // Trial day 12 of 30 leaves 18 days; day 5 of 30 leaves 25.
    expect(daysBetween(NOW, new Date(sub('rosewood').nextStateAt))).toBe(18);
    expect(daysBetween(NOW, new Date(sub('atelierVasquine').nextStateAt))).toBe(25);
    // Sunny Days: Limited, day 20 of the dunning timeline.
    expect(daysBetween(new Date(sub('sunnyDays').stateSince), NOW)).toBeLessThanOrEqual(20);
    // Meadowview: Closed, permanent deletion due in 40 days.
    const next = nextTransition(sub('meadowview'), POLICY, NOW);
    expect(next?.state).toBe('deleted');
    expect(daysBetween(NOW, next!.at)).toBe(40);
  });

  it('puts Willow Lane Past due for 10 days with 4 payment attempts (three soft declines, one hard)', async () => {
    const { dump, keys } = await seeded();
    const sub = dump['subscriptions'].find((s) => s.clientId === keys.clients['willowLane'])!;
    expect(sub.state).toBe('pastDue');
    expect(daysBetween(new Date(sub.stateSince), NOW)).toBe(10);
    const attempts = dump['paymentAttempts'].filter((p) => p.clientId === keys.clients['willowLane']);
    expect(attempts).toHaveLength(4);
    expect(attempts.filter((a) => a.result === 'softDecline')).toHaveLength(3);
    expect(attempts.filter((a) => a.result === 'hardDecline')).toHaveLength(1);
    expect(accountStateAt(sub, attempts, POLICY, NOW)).toBe('pastDue');
  });

  it('gives Maison Elvaro and Atelier Vasquine no sites, people or users yet (M6)', async () => {
    const { dump, keys } = await seeded();
    for (const k of ['maisonElvaro', 'atelierVasquine']) {
      for (const store of ['sites', 'people', 'users', 'evidence']) {
        expect(
          dump[store].filter((r) => r.clientId === keys.clients[k]),
          `${k} ${store}`,
        ).toHaveLength(0);
      }
    }
  });
});

describe('seed: Little Acorns people (7.3)', () => {
  it('has one site, the four rooms, 14 active staff and 1 archived leaver', async () => {
    const { dump, keys } = await seeded();
    const la = keys.clients['littleAcorns'];
    expect(dump['sites'].filter((s) => s.clientId === la)).toHaveLength(1);
    expect(
      dump['teams']
        .filter((t) => t.clientId === la)
        .map((t) => t.name)
        .sort(),
    ).toEqual(['Baby room', 'Kitchen', 'Pre-school room', 'Toddler room']);
    const people = dump['people'].filter((p) => p.clientId === la);
    expect(people).toHaveLength(15);
    expect(people.filter((p) => p.status !== 'archived')).toHaveLength(14);
    expect(people.filter((p) => p.status === 'archived').map((p) => p.firstName)).toEqual(['Olivia']);
  });

  it('uses exactly the 15 fictional names from the build pack', async () => {
    const { dump, keys } = await seeded();
    const names = dump['people']
      .filter((p) => p.clientId === keys.clients['littleAcorns'])
      .map((p) => `${p.firstName} ${p.lastName}`)
      .sort();
    expect(names).toEqual(
      [
        'Priya Shah',
        'Daniel Hughes',
        'Jade Mills',
        'Maureen Clarke',
        'Sam Okafor',
        'Ellie Brown',
        'Hannah Patel',
        'Chris Wood',
        'Lucy Evans',
        'Mark Taylor',
        'Kasia Nowak',
        'Grace Lee',
        'Ben Carter',
        'Amira Hassan',
        'Olivia Grant',
      ].sort(),
    );
  });

  it('sets the dated facts relative to today', async () => {
    const { dump, keys } = await seeded();
    const la = keys.clients['littleAcorns'];
    const get = (n: string) => byName(dump, la, n);
    expect(daysBetween(new Date(get('Sam').startDate), NOW)).toBe(10);
    expect(get('Grace').status).toBe('onLeave');
    const olivia = get('Olivia');
    expect(olivia.status).toBe('archived');
    expect(daysBetween(new Date(olivia.leftDate!), NOW)).toBe(daysBetween(addMonths(NOW, -2), NOW));
  });

  it('sets the persona preferences: Maureen simple view with large text, Kasia a second language', async () => {
    const { dump, keys } = await seeded();
    const maureen = byName(dump, keys.clients['littleAcorns'], 'Maureen');
    expect(maureen.prefs.simpleView).toBe(true);
    expect(maureen.prefs.textScale).toBeGreaterThan(1);
    expect(byName(dump, keys.clients['littleAcorns'], 'Kasia').prefs.language).not.toBe('en-GB');
    expect(byName(dump, keys.clients['littleAcorns'], 'Jade').prefs.simpleView).toBe(false);
  });

  it('gives Priya the Account Owner role and Daniel the Supervisor role', async () => {
    const { dump, keys } = await seeded();
    const roleNameFor = (userKey: string) => {
      const a = dump['roleAssignments'].find((x) => x.userId === keys.users[userKey])!;
      return a.roleIds.map((id: string) => dump['roles'].find((r) => r.id === id).name);
    };
    const name = (key: string) => clientRoleTemplates.find((t) => t.key === key)!.name;
    expect(roleNameFor('priya')).toEqual([name('accountOwner')]);
    expect(roleNameFor('daniel')).toEqual([name('supervisor')]);
  });

  it('keys resolve to the right records', async () => {
    const { dump, keys } = await seeded();
    const person = (k: string) => dump['people'].find((p) => p.id === keys.personas[k])!;
    expect(person('priya')).toMatchObject({ firstName: 'Priya', clientId: keys.clients['littleAcorns'] });
    expect(person('jade').firstName).toBe('Jade');
    expect(person('olivia').status).toBe('archived');
    const user = dump['users'].find((u) => u.id === keys.users['jade'])!;
    expect(user).toMatchObject({
      side: 'staff',
      personId: keys.personas['jade'],
      clientId: keys.clients['littleAcorns'],
    });
    expect(dump['users'].find((u) => u.id === keys.users['priya'])!.side).toBe('client');
    expect(dump['requirements'].find((r) => r.id === keys.requirements['safeguarding'])!.name).toBe('Safeguarding');
    expect(dump['evidenceSubmissions'].find((s) => s.id === keys.submissions['ben'])!.personId).toBe(
      keys.personas['ben'],
    );
  });
});

describe('seed: Little Acorns requirement statuses at today (7.3)', () => {
  const clusterDay = (offset: number) => addDays(mondayOfWeek(addDays(NOW, 14)), offset);

  it.each([
    ['Lucy', 'Tuesday', 1],
    ['Hannah', 'Wednesday', 2],
    ['Chris', 'Thursday', 3],
  ])('%s safeguarding is expiringSoon, expiring on the %s of the cluster week', async (first, weekday, offset) => {
    const { dump, keys } = await seeded();
    const s = (await statusesFor(dump, byName(dump, keys.clients['littleAcorns'], first).id))['Safeguarding']!;
    expect(s.status).toBe('expiringSoon');
    const parts = londonParts(s.expiresAt!);
    expect(parts.weekday).toBe(weekday);
    expect(parts.hhmm).toBe('23:59');
    expect(parts.date).toBe(londonParts(clusterDay(offset).toISOString()).date);
    expect(s.daysLeft).toBeGreaterThan(14);
    expect(s.daysLeft).toBeLessThan(60);
  });

  it('Mark paediatric first aid is overdue by 8 days', async () => {
    const { dump, keys } = await seeded();
    const s = (await statusesFor(dump, byName(dump, keys.clients['littleAcorns'], 'Mark').id))['Paediatric first aid']!;
    expect(s.status).toBe('overdue');
    expect(s.daysLeft).toBe(-8);
  });

  it('Maureen food hygiene is expiringSoon with 20 days left', async () => {
    const { dump, keys } = await seeded();
    const s = (await statusesFor(dump, byName(dump, keys.clients['littleAcorns'], 'Maureen').id))['Food hygiene']!;
    expect(s).toMatchObject({ status: 'expiringSoon', daysLeft: 20 });
  });

  it('Ben safeguarding is awaitingCheck, with a certificate submission 4 working days old', async () => {
    const { dump, keys } = await seeded();
    const ben = byName(dump, keys.clients['littleAcorns'], 'Ben');
    expect((await statusesFor(dump, ben.id))['Safeguarding']!.status).toBe('awaitingCheck');
    const sub = (dump['evidenceSubmissions'] as EvidenceSubmission[]).find((s) => s.personId === ben.id)!;
    expect(sub.status).toBe('awaitingCheck');
    expect(sub.clientId).toBe(keys.clients['littleAcorns']);
    let working = 0;
    for (let d = new Date(sub.createdAt); daysBetween(d, NOW) > 0; d = addDays(d, 1)) {
      const wd = londonParts(addDays(d, 1).toISOString()).weekday;
      if (wd !== 'Saturday' && wd !== 'Sunday') working++;
    }
    expect(working).toBe(4);
  });

  it('Amira What changed in September 2026 is notStarted', async () => {
    const { dump, keys } = await seeded();
    const amira = byName(dump, keys.clients['littleAcorns'], 'Amira');
    expect((await statusesFor(dump, amira.id))['What changed in September 2026']!.status).toBe('notStarted');
  });

  it('Olivia is notAssigned for every requirement', async () => {
    const { dump, keys } = await seeded();
    const s = await statusesFor(dump, byName(dump, keys.clients['littleAcorns'], 'Olivia').id);
    expect(Object.keys(s).length).toBeGreaterThan(0);
    for (const v of Object.values(s)) expect(v.status).toBe('notAssigned');
  });

  it('everyone else has current safeguarding, first aid and What changed evidence', async () => {
    const { dump, keys } = await seeded();
    const special = new Set(['Lucy', 'Hannah', 'Chris', 'Mark', 'Ben', 'Amira', 'Olivia', 'Sam']);
    const rest = (dump['people'] as Person[]).filter(
      (p) => p.clientId === keys.clients['littleAcorns'] && !special.has(p.firstName),
    );
    expect(rest).toHaveLength(7);
    for (const p of rest) {
      const s = await statusesFor(dump, p.id);
      expect(s['Safeguarding']!.status, p.firstName).toBe('current');
      expect(s['What changed in September 2026']!.status, p.firstName).toBe('current');
      if (p.firstName !== 'Maureen') expect(s['Paediatric first aid']!.status, p.firstName).toBe('current');
    }
  });

  it('the dashboard counts: three safeguarding expiring, one first aid overdue, one food hygiene expiring, one module not started', async () => {
    const { dump, keys } = await seeded();
    const tally: Record<string, number> = {};
    for (const p of (dump['people'] as Person[]).filter((x) => x.clientId === keys.clients['littleAcorns'])) {
      for (const [req, v] of Object.entries(await statusesFor(dump, p.id))) {
        const k = `${req}:${v.status}`;
        tally[k] = (tally[k] ?? 0) + 1;
      }
    }
    expect(tally['Safeguarding:expiringSoon']).toBe(3);
    expect(tally['Paediatric first aid:overdue']).toBe(1);
    expect(tally['Food hygiene:expiringSoon']).toBe(1);
    expect(tally['What changed in September 2026:notStarted']).toBe(1);
  });
});

describe('seed: Oak Tree Nurseries and Willow Lane', () => {
  it('has Oak Tree with three sites of 6, 5 and 4 staff and one person on two sites', async () => {
    const { dump, keys } = await seeded();
    const ot = keys.clients['oakTree'];
    const sites = dump['sites'].filter((s) => s.clientId === ot);
    expect(sites.map((s) => s.name).sort()).toEqual(['Hillside', 'Meadow', 'Riverside']);
    const region = (n: string) => sites.find((s) => s.name === n).region;
    expect(region('Riverside')).toBe('South East');
    expect(region('Hillside')).toBe('South East');
    expect(region('Meadow')).toBe('South West');
    for (const s of sites) expect(s.countryCode).toBe('GB');
    const people = dump['people'].filter((p) => p.clientId === ot);
    expect(people).toHaveLength(15);
    const count = (siteKey: string) => people.filter((p) => p.primarySiteId === keys.sites[siteKey]).length;
    expect([count('riverside'), count('hillside'), count('meadow')]).toEqual([6, 5, 4]);
    const multi = people.filter((p) => p.additionalSiteIds.length > 0);
    expect(multi.map((p) => p.id)).toEqual([keys.personas['bankPractitioner']]);
    expect(multi[0].primarySiteId).toBe(keys.sites['riverside']);
    expect(multi[0].additionalSiteIds).toEqual([keys.sites['meadow']]);
  });

  it('has a Group Admin and a Site Manager per site scoped to that site', async () => {
    const { dump, keys } = await seeded();
    const ot = keys.clients['oakTree'];
    const roleName = (id: string) => dump['roles'].find((r) => r.id === id).name;
    const tpl = (k: string) => clientRoleTemplates.find((t) => t.key === k)!.name;
    const otUsers = new Set(dump['users'].filter((u) => u.clientId === ot).map((u) => u.id));
    const assignments = dump['roleAssignments'].filter((a) => otUsers.has(a.userId));
    expect(assignments.filter((a) => a.roleIds.map(roleName).includes(tpl('groupAdmin')))).toHaveLength(1);
    const managers = assignments.filter((a) => a.roleIds.map(roleName).includes(tpl('siteManager')));
    expect(managers).toHaveLength(3);
    expect(managers.map((a) => a.scope.ids[0]).sort()).toEqual(
      [keys.sites['riverside'], keys.sites['hillside'], keys.sites['meadow']].sort(),
    );
    for (const m of managers) expect(m.scope).toMatchObject({ type: 'sites' });
    expect(otUsers.has(keys.users['oakTreeGroupAdmin'])).toBe(true);
    expect(managers.map((a) => a.userId).sort()).toEqual(
      [keys.users['riversideManager'], keys.users['hillsideManager'], keys.users['meadowManager']].sort(),
    );
  });

  it('has Willow Lane with one site and 8 people', async () => {
    const { dump, keys } = await seeded();
    const wl = keys.clients['willowLane'];
    expect(dump['sites'].filter((s) => s.clientId === wl)).toHaveLength(1);
    expect(dump['people'].filter((p) => p.clientId === wl)).toHaveLength(8);
  });
});

describe('seed: validity and fictional data', () => {
  it('every record in every populated store passes its Zod schema', async () => {
    const { dump } = await seeded();
    for (const [store, schema] of Object.entries(schemaByStore)) {
      expect(dump[store].length, store).toBeGreaterThan(0);
      for (const record of dump[store]) expect(() => schema.parse(record), store).not.toThrow();
    }
  });

  it('every client-owned record carries a clientId that names a real client, and siteId where relevant', async () => {
    const { dump } = await seeded();
    const clientIds = new Set(dump['clients'].map((c) => c.id));
    const siteClient = new Map(dump['sites'].map((s) => [s.id, s.clientId]));
    for (const store of [
      'sites',
      'teams',
      'people',
      'evidence',
      'evidenceSubmissions',
      'subscriptions',
      'paymentAttempts',
    ]) {
      for (const r of dump[store]) {
        expect(clientIds.has(r.clientId), `${store} clientId`).toBe(true);
      }
    }
    for (const t of dump['teams']) expect(siteClient.get(t.siteId)).toBe(t.clientId);
    for (const p of dump['people']) {
      expect(siteClient.get(p.primarySiteId)).toBe(p.clientId);
      for (const s of p.additionalSiteIds) expect(siteClient.get(s)).toBe(p.clientId);
    }
    for (const s of dump['evidenceSubmissions']) expect(siteClient.get(s.siteId)).toBe(s.clientId);
    for (const e of dump['evidence']) expect(siteClient.get(e.siteIdAtTime)).toBe(e.clientId);
    for (const r of dump['roles']) {
      expect(r.owner === 'provider' || clientIds.has(r.owner.clientId)).toBe(true);
    }
    for (const u of dump['users'].filter((x) => x.side !== 'provider')) expect(clientIds.has(u.clientId)).toBe(true);
    for (const e of dump['evidence']) {
      const person = dump['people'].find((p) => p.id === e.personId)!;
      expect(person.clientId).toBe(e.clientId);
    }
  });

  it('uses the reserved .test domain for every email', async () => {
    const { dump } = await seeded();
    const emails = [...dump['users'].map((u) => u.email), ...dump['subscriptions'].map((s) => s.billingContact)].filter(
      (e) => e !== undefined,
    );
    expect(emails.length).toBeGreaterThan(20);
    for (const e of emails) expect(e).toMatch(/^[^@\s]+@[^@\s]+\.test$/);
  });

  it('has globally unique ids within each store', async () => {
    const { dump } = await seeded();
    for (const store of ['clients', 'sites', 'people', 'users', 'evidence', 'roles', 'roleAssignments']) {
      const ids = dump[store].map((r) => r.id);
      expect(new Set(ids).size, store).toBe(ids.length);
    }
  });

  it('writes the seed metadata and leaves the audit log empty and the outbox with only the M4 price notice', async () => {
    const { admin, dump } = await seeded();
    expect(await admin.getSeedMeta()).toEqual({ seedValue: 20261019, today: TODAY, seedVersion: 8 });
    expect(dump['audit']).toHaveLength(0);
    // Seed version 5 (M4) adds the Brookfield price change notice; nothing else is in the Outbox.
    expect(dump['outbox']).toHaveLength(1);
  });

  it('includes the nursery pack requirements and job roles and the packages and add-ons', async () => {
    const { dump } = await seeded();
    for (const r of nurseryPack.requirements) expect(dump['requirements'].some((x) => x.id === r.id)).toBe(true);
    for (const r of nurseryPack.jobRoles) expect(dump['jobRoles'].some((x) => x.id === r.id)).toBe(true);
    expect(dump['packages'].length).toBeGreaterThanOrEqual(4);
    expect(dump['addOns'].length).toBeGreaterThanOrEqual(5);
  });
});
