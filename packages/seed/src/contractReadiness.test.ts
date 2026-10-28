// Chunk 8: proves the seed supports every scenario the shared contract suite needs once it is switched from the
// hand-built fixture to the seed (plan "Contract and integration tests"). Runs against the memory adapter.
import { describe, expect, it } from 'vitest';
import { fixedClock, createRng, type Evidence } from '@sta/domain';
import { createMemoryStore, ForbiddenError, NotFoundError, type ActorContext } from '@sta/data';
import { load } from './index';
import { SEED, TODAY } from './testing';

async function world() {
  const handle = createMemoryStore({ clock: fixedClock(TODAY), rng: createRng(5) });
  const keys = await load(handle.admin, SEED);
  const client = (userKey: string, clientKey = 'littleAcorns'): ActorContext => ({
    userId: keys.users[userKey]!,
    side: 'client',
    clientId: keys.clients[clientKey]!,
    now: TODAY,
  });
  const staff = (userKey: string): ActorContext => ({
    userId: keys.users[userKey]!,
    side: 'staff',
    clientId: keys.clients['littleAcorns'],
    now: TODAY,
  });
  const provider = (userKey: string): ActorContext => ({ userId: keys.users[userKey]!, side: 'provider', now: TODAY });
  return { ...handle, keys, client, staff, provider };
}

const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('expected refusal');
};

describe('seed as the contract suite world', () => {
  it('Priya lists the 15 Little Acorns people and none from Oak Tree or Willow Lane', async () => {
    const w = await world();
    const people = await w.store.people.list(w.client('priya'));
    expect(people).toHaveLength(15);
    expect(people.every((p) => p.clientId === w.keys.clients['littleAcorns'])).toBe(true);
  });

  it('Priya gets NotFound for an Oak Tree person and site, and Forbidden tenant for a put into Oak Tree', async () => {
    const w = await world();
    const ctx = w.client('priya');
    expect(await refusal(w.store.people.get(ctx, w.keys.personas['bankPractitioner']))).toBeInstanceOf(NotFoundError);
    expect(await refusal(w.store.sites.get(ctx, w.keys.sites['riverside']))).toBeInstanceOf(NotFoundError);
    const jade = await w.store.people.get(ctx, w.keys.personas['jade']);
    const err = await refusal(
      w.store.people.put(ctx, { ...jade, id: 'Y'.repeat(26), clientId: w.keys.clients['oakTree'] }),
    );
    expect(err).toBeInstanceOf(ForbiddenError);
    expect((err as ForbiddenError).reason).toBe('tenant');
  });

  it('the Riverside Site Manager sees Riverside people plus the bank practitioner, and the Meadow manager sees Meadow plus the bank practitioner', async () => {
    const w = await world();
    const riverside = await w.store.people.list(w.client('riversideManager', 'oakTree'));
    const meadow = await w.store.people.list(w.client('meadowManager', 'oakTree'));
    const bank = w.keys.personas['bankPractitioner'];
    expect(riverside).toHaveLength(6);
    expect(riverside.map((p) => p.id)).toContain(bank);
    expect(meadow).toHaveLength(5);
    expect(meadow.map((p) => p.id)).toContain(bank);
    expect(
      riverside.every(
        (p) => p.primarySiteId === w.keys.sites['riverside'] || p.additionalSiteIds.includes(w.keys.sites['riverside']),
      ),
    ).toBe(true);
  });

  it('Jade lists only herself and reads her own evidence but not Hannah evidence', async () => {
    const w = await world();
    const ctx = w.staff('jade');
    expect((await w.store.people.list(ctx)).map((p) => p.id)).toEqual([w.keys.personas['jade']]);
    const mine = await w.store.evidence.list(ctx);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((e: Evidence) => e.personId === w.keys.personas['jade'])).toBe(true);
    const hannahEvidence = ((await w.admin.dumpAll())['evidence'] as Evidence[]).find(
      (e) => e.personId === w.keys.personas['hannah'],
    )!;
    expect(await refusal(w.store.evidence.get(ctx, hannahEvidence.id))).toBeInstanceOf(NotFoundError);
  });

  it('the provider Owner lists all 13 clients and Support cannot list people', async () => {
    const w = await world();
    expect(await w.store.clients.list(w.provider('providerOwner'))).toHaveLength(13);
    const err = await refusal(w.store.people.list(w.provider('sophie')));
    expect(err).toBeInstanceOf(ForbiddenError);
  });

  it('Tom (Read-only) cannot put a client', async () => {
    const w = await world();
    const clients = await w.store.clients.list(w.provider('providerOwner'));
    expect(
      await refusal(w.store.clients.put(w.provider('tom'), { ...clients[0]!, displayName: 'Changed' })),
    ).toBeInstanceOf(ForbiddenError);
  });

  it('Priya can read subscriptions but Daniel cannot (no billing permission)', async () => {
    const w = await world();
    expect(await w.store.subscriptions.list(w.client('priya'))).toHaveLength(1);
    expect(await refusal(w.store.subscriptions.list(w.client('daniel')))).toBeInstanceOf(ForbiddenError);
  });

  it('Daniel can see Ben submission, approve it, and Ben safeguarding becomes current', async () => {
    const w = await world();
    const ctx = w.client('daniel');
    const sub = await w.store.evidenceSubmissions.get(ctx, w.keys.submissions['ben']);
    expect(sub.status).toBe('awaitingCheck');
    expect(sub.uploadedBy).not.toBe(w.keys.users['daniel']);
    const done = await w.store.evidenceFlow.review(ctx, sub.id, { kind: 'approve' });
    expect(done.status).toBe('approved');
    const evidence = (await w.store.evidence.list(ctx)).filter(
      (e) => e.personId === w.keys.personas['ben'] && e.requirementId === w.keys.requirements['safeguarding'],
    );
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.approvedBy).toBe(w.keys.users['daniel']);
  });

  it('every persona key resolves in the people and users stores of the right side', async () => {
    const w = await world();
    const dump = await w.admin.dumpAll();
    const peopleIds = new Set((dump['people'] as { id: string }[]).map((p) => p.id));
    const userIds = new Set((dump['users'] as { id: string }[]).map((u) => u.id));
    for (const id of Object.values(w.keys.personas)) expect(peopleIds.has(id)).toBe(true);
    for (const id of Object.values(w.keys.users)) expect(userIds.has(id)).toBe(true);
  });
});
