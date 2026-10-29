// M1 chunk 6: the seed's learning content (plan Assumptions 1, 10, 11, 19; build pack 7.3 and 7.4).
// Assumes: @sta/content exports `nurseryModules` (so the seed needs no ?raw import of its own; Vite and Vitest resolve it),
// @sta/seed exports SEED_VERSION and `ensureCurrentSeed(admin)`, and SeedMeta gains an optional `seedVersion`.
import { describe, expect, it } from 'vitest';
import { moduleIds, nurseryModules } from '@sta/content';
import type { Assignment, Attachment, ClientLinkOverlay, Evidence, Module, Notification } from '@sta/domain';
import { DEFAULT_SEED_VALUE, SEED_VERSION, ensureCurrentSeed, load, seedKeys } from './index';
import { freshStore, hashStores, seeded, SEED, TODAY } from './testing';

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / DAY;
const sgId = moduleIds.safeguardingAndWhistleblowing;

describe('seed version', () => {
  it('is 7 after M4 chunk 18b (3 was M2) and is stored in SeedMeta by load', async () => {
    expect(SEED_VERSION).toBe(9);
    const { admin } = await seeded();
    expect(await admin.getSeedMeta()).toMatchObject({ seedValue: SEED.seedValue, today: TODAY, seedVersion: 9 });
  });
});

describe('content loader', () => {
  it('exports the nursery modules from @sta/content with a published Safeguarding module', () => {
    expect(Array.isArray(nurseryModules)).toBe(true);
    const sg = nurseryModules.find((m) => m.id === sgId);
    expect(sg?.status).toBe('published');
  });
});

describe('modules in the seed', () => {
  it('stores the Safeguarding module, published, equal to the content package copy', async () => {
    const { dump } = await seeded();
    const stored = (dump['modules'] as Module[]).find((m) => m.id === sgId);
    expect(stored).toBeDefined();
    expect(stored!.status).toBe('published');
    expect(stored).toEqual(nurseryModules.find((m) => m.id === sgId));
  });

  it('stores every nursery module exactly once', async () => {
    const { dump } = await seeded();
    // M3 adds Little Acorns' own modules; the provider modules are still exactly the nursery set.
    const provider = (dump['modules'] as Module[]).filter((m) => m.owner === 'provider');
    expect(provider.map((m) => m.id).sort()).toEqual(nurseryModules.map((m) => m.id).sort());
  });
});

describe('Jade (Assumption 1)', () => {
  async function jade() {
    const s = await seeded();
    const { keys, dump } = s;
    const personId = keys.personas['jade']!;
    const req = keys.requirements['safeguarding']!;
    const evidence = (dump['evidence'] as Evidence[])
      .filter((e) => e.personId === personId && e.requirementId === req)
      .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));
    // M2 adds a past Safer sleep assignment for Jade, so compare Safeguarding assignments only (conflict 11).
    const assignments = (dump['assignments'] as Assignment[]).filter(
      (a) => a.personId === personId && 'moduleId' in a.target && a.target.moduleId === sgId,
    );
    return { ...s, personId, evidence, assignments };
  }

  it('has Safeguarding evidence about 18 months old with about 6 months left, outside the amber window', async () => {
    const { evidence, dump, keys } = await jade();
    const latest = evidence[0]!;
    expect(daysBetween(latest.completedAt, TODAY)).toBeGreaterThan(18 * 30 - 8);
    expect(daysBetween(latest.completedAt, TODAY)).toBeLessThan(18 * 31 + 3);
    expect(latest.expiresAt).toBeDefined();
    const left = daysBetween(TODAY, latest.expiresAt!);
    expect(left).toBeGreaterThan(170);
    expect(left).toBeLessThan(195);
    const client = (dump['clients'] as any[]).find((c) => c.id === keys.clients['littleAcorns']);
    expect(left).toBeGreaterThan(client.settings.amberWindowDays);
  });

  it('has a module-kind evidence record for the Safeguarding module', async () => {
    const { evidence } = await jade();
    expect(evidence[0]).toMatchObject({ kind: 'module', moduleId: sgId });
  });

  it('has exactly one open assignment of Safeguarding from Priya, made 3 days ago, due 14 days from today', async () => {
    const { assignments, keys } = await jade();
    expect(assignments).toHaveLength(1);
    const a = assignments[0]!;
    expect(a.status).toBe('open');
    expect(a.target).toEqual({ moduleId: sgId });
    expect(a.source).toBe('manual');
    expect(a.clientId).toBe(keys.clients['littleAcorns']);
    expect(a.assignedBy).toBe(keys.users['priya']);
    expect(daysBetween(a.createdAt, TODAY)).toBeGreaterThan(2.5);
    expect(daysBetween(a.createdAt, TODAY)).toBeLessThan(3.5);
    expect(daysBetween(TODAY, a.dueAt)).toBeGreaterThan(13.5);
    expect(daysBetween(TODAY, a.dueAt)).toBeLessThan(15);
  });

  it('is the only person with a Safeguarding assignment; other personas keep the M0 evidence (M2 adds Safer sleep ones)', async () => {
    const { dump, personId } = await jade();
    const others = (dump['assignments'] as Assignment[]).filter(
      (a) => a.personId !== personId && 'moduleId' in a.target && a.target.moduleId === sgId,
    );
    expect(others).toEqual([]);
  });

  it('gets one trainingAssigned notification for the assignment', async () => {
    const { dump, keys, assignments } = await jade();
    const notes = (dump['notifications'] as Notification[]).filter((n) => n.userId === keys.users['jade']);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ kind: 'trainingAssigned', clientId: keys.clients['littleAcorns'] });
    expect(notes[0]!.readAt).toBeUndefined();
    expect(notes[0]!.params['moduleTitle']).toBe(nurseryModules.find((m) => m.id === sgId)!.title);
    expect(typeof notes[0]!.params['dueDate']).toBe('string');
    expect(notes[0]!.createdAt).toBe(assignments[0]!.createdAt);
  });
});

describe('M0 world is unchanged', () => {
  it('keeps the M0 stores byte for byte except the evidence store, which only gains Jade changes', async () => {
    const { dump, keys } = await seeded();
    const jadeId = keys.personas['jade'];
    const m1 = (dump['evidence'] as Evidence[]).filter((e) => e.personId !== jadeId);
    // The rest of the evidence must be independent of the new streams: reseeding gives the same hash.
    const again = (await seeded()).dump['evidence'].filter((e: Evidence) => e.personId !== jadeId);
    expect(hashStores({ e: m1 })).toEqual(hashStores({ e: again }));
    expect(dump['clients']).toHaveLength(13);
    expect(dump['people'].filter((p: any) => p.clientId === keys.clients['littleAcorns'])).toHaveLength(15);
  });
});

describe('organisation policy and overlays (Assumption 10)', () => {
  async function littleAcorns() {
    const s = await seeded();
    const clientId = s.keys.clients['littleAcorns']!;
    const attachments = (s.dump['attachments'] as Attachment[]).filter((a) => a.clientId === clientId);
    const overlays = (s.dump['clientLinkOverlays'] as ClientLinkOverlay[]).filter((o) => o.clientId === clientId);
    return { ...s, clientId, attachments, overlays };
  }

  it('has one fictional markdown policy attachment of about 150 words', async () => {
    const { attachments } = await littleAcorns();
    const policy = attachments.find((a) => a.title === 'Little Acorns Safeguarding policy');
    expect(policy).toBeDefined();
    expect(policy!.mime).toBe('text/markdown');
    expect(policy!.kind).toBe('document');
    const words = (policy as { body: string }).body.split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThan(100);
    expect(words).toBeLessThan(220);
  });

  it('has two overlays on Safeguarding questions: the EYFS 3.4 DSL question and the whistleblowing question', async () => {
    const { overlays, attachments } = await littleAcorns();
    expect(overlays).toHaveLength(2);
    const sg = nurseryModules.find((m) => m.id === sgId)!;
    const policy = attachments.find((a) => a.title === 'Little Acorns Safeguarding policy')!;
    for (const o of overlays) {
      expect(o.moduleId).toBe(sgId);
      expect(sg.questions.some((q) => q.id === o.questionId)).toBe(true);
      expect(o.links).toHaveLength(1);
      expect(o.links[0]).toMatchObject({
        kind: 'organisation',
        attachmentId: policy.id,
        title: 'Little Acorns Safeguarding policy, section 2',
        publisher: 'Little Acorns Nursery',
        showFor: 'all',
      });
    }
    const questions = overlays.map((o) => sg.questions.find((q) => q.id === o.questionId)!);
    expect(questions.some((q) => q.sourceRef === 'EYFS 3.4')).toBe(true);
    expect(questions.some((q) => q.learnMore.some((l) => l.url?.includes('nspcc.org.uk')))).toBe(true);
  });

  it('gives no other client an attachment or overlay', async () => {
    const { dump, clientId } = await littleAcorns();
    // M4 adds one fictional ticket screenshot for Willow Lane (the support demo), which is not a policy attachment.
    const policies = (dump['attachments'] as Attachment[]).filter(
      (a) => !(a.kind === 'file' && a.purpose === 'ticketScreenshot'),
    );
    expect(policies.every((a) => a.clientId === clientId)).toBe(true);
    expect((dump['clientLinkOverlays'] as ClientLinkOverlay[]).every((o) => o.clientId === clientId)).toBe(true);
  });

  it('stores records the data layer accepts (written through bulkPut validation)', async () => {
    const { admin, dump } = await littleAcorns();
    await expect(admin.bulkPut('attachments', dump['attachments'] as any)).resolves.not.toThrow();
  });
});

describe('determinism with the new streams', () => {
  it('gives identical hashes for every store on two loads, including modules, assignments, notifications, attachments and overlays', async () => {
    const a = hashStores((await seeded()).dump);
    const b = hashStores((await seeded()).dump);
    expect(b).toEqual(a);
    for (const name of ['modules', 'assignments', 'notifications', 'attachments', 'clientLinkOverlays']) {
      expect(a[name], name).toBeDefined();
    }
  });

  it('returns the same keys from seedKeys as from load', async () => {
    const { keys } = await seeded();
    expect(seedKeys(SEED)).toEqual(keys);
  });

  it('still places Jade, Safeguarding and the assignment for a different seed value', async () => {
    const { dump, keys } = await seeded({ seedValue: 42, today: TODAY });
    expect(
      (dump['assignments'] as Assignment[]).filter(
        (a) => a.personId === keys.personas['jade'] && 'moduleId' in a.target && a.target.moduleId === sgId,
      ),
    ).toHaveLength(1);
  });
});

describe('ensureCurrentSeed (Assumption 19)', () => {
  it('reloads an M0 world (no stored seedVersion) with the same seed value and today', async () => {
    const handle = freshStore();
    const admin = handle.admin;
    await load(admin, { seedValue: 777, today: TODAY });
    await admin.clearAll();
    await admin.setSeedMeta({ seedValue: 777, today: TODAY }); // what M0 stored: no version
    const keys = await ensureCurrentSeed(admin);
    expect(keys).not.toBeNull();
    expect(await admin.getSeedMeta()).toMatchObject({ seedValue: 777, today: TODAY, seedVersion: 9 });
    const dump = (await admin.dumpAll()) as Record<string, any[]>;
    expect(dump['modules']!.length).toBeGreaterThan(0);
    expect(
      (dump['assignments'] as Assignment[]).filter((a) => 'moduleId' in a.target && a.target.moduleId === sgId),
    ).toHaveLength(1);
    expect(dump['clients']).toHaveLength(13);
  });

  it('reloads when the stored version is lower than the current one', async () => {
    const admin = freshStore().admin;
    await load(admin, SEED);
    await admin.setSeedMeta({ seedValue: SEED.seedValue, today: TODAY, seedVersion: 1 });
    await admin.bulkPut('assignments', []);
    expect(await ensureCurrentSeed(admin)).not.toBeNull();
    expect((await admin.getSeedMeta())?.seedVersion).toBe(9);
  });

  it('does nothing when the stored version is current, keeping local changes', async () => {
    // bulkPut never deletes, so the local change is a changed record: the assignment marked done.
    const { admin, dump } = await seeded();
    const open = dump['assignments']!.find((a) => 'moduleId' in a.target && a.target.moduleId === sgId)!;
    await admin.bulkPut('assignments', [{ ...open, status: 'done' }]);
    expect(await ensureCurrentSeed(admin)).toBeNull();
    const after = ((await admin.dumpAll()) as Record<string, any[]>)['assignments']!;
    expect(after).toHaveLength(dump['assignments']!.length);
    expect(after.find((a) => a.id === open.id).status).toBe('done');
  });

  it('does nothing when nothing is stored (first load stays with the caller)', async () => {
    const admin = freshStore().admin;
    expect(await ensureCurrentSeed(admin)).toBeNull();
    expect(await admin.getSeedMeta()).toBeUndefined();
  });

  it('resets the clock offset like Reset demo', async () => {
    const admin = freshStore().admin;
    await load(admin, SEED);
    await admin.setSeedMeta({ seedValue: SEED.seedValue, today: TODAY });
    await admin.setDemoState({
      clockOffsetMs: 5 * DAY,
      industry: 'nursery',
      persona: { side: 'staff', userId: seedKeys(SEED).users['jade']! },
    });
    await ensureCurrentSeed(admin);
    expect((await admin.getDemoState())?.clockOffsetMs).toBe(0);
  });

  it('exports a default seed value for first load', () => {
    expect(DEFAULT_SEED_VALUE).toBe(20261019);
  });
});
