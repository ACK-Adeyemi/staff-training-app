// Chunk 8: fast-forward through the data layer and seed (BP-5).
import { describe, expect, it } from 'vitest';
import {
  addDays,
  fixedClock,
  offsetClock,
  personRequirementStatus,
  type Evidence,
  type EvidenceSubmission,
  type Person,
  type Requirement,
  type RequirementStatusName,
} from '@sta/domain';
import { reset } from './index';
import { seeded, TODAY, type Dump } from './testing';

const DAY = 86_400_000;
const TEST_PERSON_ID = 'T'.repeat(26);

async function statusOf(
  admin: Awaited<ReturnType<typeof seeded>>['admin'],
  personId: string,
  reqName: string,
  now: Date,
) {
  const dump = (await admin.dumpAll()) as Dump;
  const person = (dump['people'] as Person[]).find((p) => p.id === personId)!;
  const site = dump['sites'].find((s) => s.id === person.primarySiteId);
  const client = dump['clients'].find((c) => c.id === person.clientId);
  const req = (dump['requirements'] as Requirement[]).find((r) => r.name === reqName)!;
  return personRequirementStatus(
    req,
    person,
    site,
    (dump['evidence'] as Evidence[]).filter((e) => e.personId === personId),
    (dump['evidenceSubmissions'] as EvidenceSubmission[]).filter((s) => s.personId === personId),
    now,
    client.settings.amberWindowDays,
  ).status;
}

async function addTestPerson(world: Awaited<ReturnType<typeof seeded>>, expiresInDays: number) {
  const { admin, dump, keys } = world;
  const template = (dump['people'] as Person[]).find((p) => p.id === keys.personas['jade'])!;
  const req = (dump['requirements'] as Requirement[]).find((r) => r.name === 'Safeguarding')!;
  await admin.bulkPut('people', [{ ...template, id: TEST_PERSON_ID, firstName: 'Testa', lastName: 'Fastforward' }]);
  await admin.bulkPut('evidence', [
    {
      id: 'V'.repeat(26),
      clientId: template.clientId,
      personId: TEST_PERSON_ID,
      requirementId: req.id,
      kind: 'external',
      completedAt: addDays(new Date(TODAY), -300).toISOString(),
      expiresAt: addDays(new Date(TODAY), expiresInDays).toISOString(),
      siteIdAtTime: template.primarySiteId,
    },
  ]);
}

describe('fast-forward over seeded data (BP-5)', () => {
  it('flips a requirement expiring in 12 days from expiringSoon to overdue at +30 days and back at today', async () => {
    const world = await seeded();
    await addTestPerson(world, 12);
    const today = new Date(TODAY);
    expect(await statusOf(world.admin, TEST_PERSON_ID, 'Safeguarding', today)).toBe('expiringSoon');
    expect(await statusOf(world.admin, TEST_PERSON_ID, 'Safeguarding', addDays(today, 30))).toBe('overdue');
    expect(await statusOf(world.admin, TEST_PERSON_ID, 'Safeguarding', today)).toBe('expiringSoon');
  });

  it('goes green, amber, red as the clock offset grows (current at today, expiringSoon at +30, overdue at +90)', async () => {
    const world = await seeded();
    await addTestPerson(world, 80);
    const base = fixedClock(TODAY);
    const seen: RequirementStatusName[] = [];
    for (const days of [0, 30, 90]) {
      seen.push(await statusOf(world.admin, TEST_PERSON_ID, 'Safeguarding', offsetClock(base, days * DAY).now()));
    }
    expect(seen).toEqual(['current', 'expiringSoon', 'overdue']);
  });

  it('drives the shown date from the stored DemoState clock offset, and Back to today restores it', async () => {
    const world = await seeded();
    const { admin, keys } = world;
    const base = fixedClock(TODAY);
    const persona = { side: 'client' as const, userId: keys.users['priya']! };
    const hannah = keys.personas['hannah']!;
    const at = async () => offsetClock(base, (await admin.getDemoState())!.clockOffsetMs).now();

    await admin.setDemoState({ clockOffsetMs: 0, industry: 'nursery', persona });
    expect(await statusOf(admin, hannah, 'Safeguarding', await at())).toBe('expiringSoon');
    await admin.setDemoState({ clockOffsetMs: 30 * DAY, industry: 'nursery', persona });
    expect((await at()).toISOString()).toBe(new Date(new Date(TODAY).getTime() + 30 * DAY).toISOString());
    expect(await statusOf(admin, hannah, 'Safeguarding', await at())).toBe('overdue');
    await admin.setDemoState({ clockOffsetMs: 0, industry: 'nursery', persona });
    expect(await statusOf(admin, hannah, 'Safeguarding', await at())).toBe('expiringSoon');
  });

  it('turns all three cluster-week safeguarding expiries overdue at +30 days (15 to 17 days out)', async () => {
    const world = await seeded();
    const later = addDays(new Date(TODAY), 30);
    for (const k of ['lucy', 'hannah', 'chris']) {
      expect(await statusOf(world.admin, world.keys.personas[k]!, 'Safeguarding', new Date(TODAY)), k).toBe(
        'expiringSoon',
      );
      expect(await statusOf(world.admin, world.keys.personas[k]!, 'Safeguarding', later), k).toBe('overdue');
    }
  });

  it('at +30 days Mark is still overdue, Priya is still current and Maureen food hygiene is overdue', async () => {
    const world = await seeded();
    const later = addDays(new Date(TODAY), 30);
    expect(await statusOf(world.admin, world.keys.personas['mark']!, 'Paediatric first aid', later)).toBe('overdue');
    expect(await statusOf(world.admin, world.keys.personas['priya']!, 'Safeguarding', later)).toBe('current');
    expect(await statusOf(world.admin, world.keys.personas['maureen']!, 'Food hygiene', later)).toBe('overdue');
  });

  it('reset restores the data the fast-forward test changed', async () => {
    const world = await seeded();
    await addTestPerson(world, 12);
    await reset(world.admin);
    const dump = (await world.admin.dumpAll()) as Dump;
    expect(dump['people'].some((p) => p.id === TEST_PERSON_ID)).toBe(false);
    expect(dump['evidence'].some((e) => e.personId === TEST_PERSON_ID)).toBe(false);
  });
});
