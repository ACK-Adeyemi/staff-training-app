// M4 chunk 1: seed version 5 additions for the provider story (plan docs/plans/m4.md chunk 1; build pack 7.1, 7.2, 7.4).
// Written before the implementation. Hard constraints go through the domain schemas. Today is 2026-10-19.
import { describe, expect, it } from 'vitest';
import {
  announcementSchema,
  billingChangeRequestSchema,
  dataRequestSchema,
  incidentSchema,
  linkCheckResultSchema,
  otherEntryGroupSchema,
  priceAdjustmentSchema,
  profileChangeRequestSchema,
  recoveryRequestSchema,
  releaseNoteSchema,
  savedReplySchema,
  type Module,
} from '@sta/domain';
import { SEED_VERSION } from './index';
import { seeded, TODAY } from './testing';

const DAY = 86_400_000;
const NOW = new Date(TODAY).getTime();
const daysFromNow = (iso: string) => (new Date(iso).getTime() - NOW) / DAY;

async function world() {
  const s = await seeded();
  const c = s.keys.clients;
  return { ...s, c };
}

describe('seed version 5', () => {
  it('is 5', () => {
    expect(SEED_VERSION).toBe(5);
  });

  it('parses every new record with its schema', async () => {
    const { dump } = await world();
    const checks: [string, { parse: (v: unknown) => unknown }][] = [
      ['priceAdjustments', priceAdjustmentSchema],
      ['announcements', announcementSchema],
      ['releaseNotes', releaseNoteSchema],
      ['recoveryRequests', recoveryRequestSchema],
      ['dataRequests', dataRequestSchema],
      ['incidents', incidentSchema],
      ['otherEntryGroups', otherEntryGroupSchema],
      ['savedReplies', savedReplySchema],
      ['profileChangeRequests', profileChangeRequestSchema],
      ['linkCheckResults', linkCheckResultSchema],
    ];
    for (const [store, schema] of checks) {
      expect(dump[store].length, `${store} is seeded`).toBeGreaterThan(0);
      for (const r of dump[store]!) expect(() => schema.parse(r), store).not.toThrow();
    }
  });
});

describe('seeded price changes', () => {
  it('has an ongoing active 10 per cent loyalty discount for Oak Tree Nurseries', async () => {
    const { dump, c } = await world();
    const adj = dump['priceAdjustments']!.filter((a) => a.clientIds.includes(c['oakTree']));
    expect(adj).toHaveLength(1);
    expect(adj[0]).toMatchObject({ type: 'percent', value: -10, reason: 'loyalty', status: 'active' });
    expect(adj[0].endsAt).toBeUndefined();
    expect(adj[0].confirmedBy).toBeDefined();
  });

  it('has a confirmed 5 per cent annual review increase for Brookfield taking effect in 18 days', async () => {
    const { dump, c } = await world();
    const adj = dump['priceAdjustments']!.filter((a) => a.clientIds.includes(c['brookfield']));
    expect(adj).toHaveLength(1);
    expect(adj[0]).toMatchObject({ type: 'percent', value: 5, reason: 'annualReview', status: 'scheduled' });
    expect(daysFromNow(adj[0].effectiveAt)).toBeCloseTo(18, 0);
    expect(adj[0].noticeDays).toBeGreaterThanOrEqual(1);
  });

  it('has the Brookfield notice in the Outbox', async () => {
    const { dump, c } = await world();
    const brookfield = dump['clients']!.find((x) => x.id === c['brookfield']);
    const profile = dump['billingProfiles']!.find((p) => p.clientId === c['brookfield']);
    const notices = dump['outbox']!.filter(
      (m) => /price/i.test(`${m.subject ?? ''} ${m.reason}`) && m.to === profile?.billingContactEmail,
    );
    expect(brookfield).toBeDefined();
    expect(notices.length).toBeGreaterThanOrEqual(1);
    expect(notices[0].body).toMatch(/5/);
  });

  it('has exactly one draft change awaiting confirmation, with no confirmer', async () => {
    const { dump } = await world();
    const drafts = dump['priceAdjustments']!.filter((a) => a.status === 'draft');
    expect(drafts).toHaveLength(1);
    expect(drafts[0].confirmedBy).toBeUndefined();
    expect(dump['priceAdjustments']).toHaveLength(3);
  });

  it('leaves issued invoices untouched by the active discount seeded at the plan level', async () => {
    const { dump, c } = await world();
    for (const inv of dump['invoices']!.filter((i) => i.clientId === c['oakTree'])) {
      expect(inv.billingNameAtIssue).toBeTruthy();
      expect(inv.total).toBeGreaterThan(0);
    }
  });
});

describe('seeded profile and billing changes', () => {
  it('has Oak Tree Nurseries renamed to "Oak Tree Nurseries Group" 2 days ago, pending review', async () => {
    const { dump, c } = await world();
    const reqs = dump['profileChangeRequests']!.filter((r) => r.clientId === c['oakTree']);
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({
      kind: 'nameChange',
      oldName: 'Oak Tree Nurseries',
      newName: 'Oak Tree Nurseries Group',
      status: 'pendingReview',
    });
    expect(daysFromNow(reqs[0].createdAt)).toBeCloseTo(-2, 0);
    const client = dump['clients']!.find((x) => x.id === c['oakTree']);
    expect(client.nameHistory.at(-1)).toMatchObject({ new: 'Oak Tree Nurseries Group', reviewStatus: 'pendingReview' });
  });

  it('has one pending billing address change from Harbour Cafe Group', async () => {
    const { dump, c } = await world();
    const reqs = dump['billingChangeRequests']!.filter((r) => r.clientId === c['harbourCafe']);
    expect(reqs).toHaveLength(1);
    expect(billingChangeRequestSchema.parse(reqs[0]).status).toBe('pending');
    expect(reqs[0].proposed.address).toBeTruthy();
    expect(reqs[0].proposed.billingName).toBeUndefined();
  });
});

describe('seeded Learn more link check', () => {
  it('reports exactly one broken link, and it is a real link on a provider module question', async () => {
    const { dump } = await world();
    const results = dump['linkCheckResults']!;
    const broken = results.filter((r) => r.status === 'broken');
    expect(broken).toHaveLength(1);
    expect(results.filter((r) => r.status === 'ok').length).toBeGreaterThanOrEqual(5);
    const modules = dump['modules'] as Module[];
    const owners = modules.filter((m) => m.owner === 'provider' && m.id === broken[0].moduleId);
    expect(owners).toHaveLength(1);
    const links = owners[0]!.questions.flatMap((q) => q.learnMore);
    expect(links.some((l) => l.id === broken[0].linkId && l.url === broken[0].url)).toBe(true);
  });

  it('records a check time that is not in the future and a seeded open of the broken link in at least one client', async () => {
    const { dump } = await world();
    const broken = dump['linkCheckResults']!.find((r) => r.status === 'broken');
    expect(new Date(broken.checkedAt).getTime()).toBeLessThanOrEqual(NOW);
    const opens = dump['learningEvents']!.filter((e) => e.type === 'learnMoreOpened' && e.linkId === broken.linkId);
    expect(opens.length).toBeGreaterThanOrEqual(1);
  });

  it('seeds Learn more opens in more than one client so counts can be compared across clients', async () => {
    const { dump } = await world();
    const clients = new Set(dump['learningEvents']!.filter((e) => e.type === 'learnMoreOpened').map((e) => e.clientId));
    expect(clients.size).toBeGreaterThanOrEqual(2);
  });
});

describe('seeded Other entries and saved replies', () => {
  it('has the trending issue type phrase 5 times in 30 days, linked to real tickets', async () => {
    const { dump } = await world();
    const g = dump['otherEntryGroups']!.find(
      (x) => x.field === 'issueType' && /certificate won.t download/i.test(x.normalised),
    );
    expect(g).toBeDefined();
    expect(g.count).toBe(5);
    expect(g.ticketIds).toHaveLength(5);
    expect(g.review).toBe('unreviewed');
    expect(daysFromNow(g.firstSeen)).toBeGreaterThanOrEqual(-30);
    expect(new Date(g.lastSeen).getTime()).toBeLessThanOrEqual(NOW);
    for (const tid of g.ticketIds) {
      const t = dump['tickets']!.find((x) => x.id === tid);
      expect(t, tid).toBeDefined();
      expect(t.issueTypeOtherText).toBeTruthy();
      expect(t.issueTypeId).toBeUndefined();
    }
  });

  it('has the staff rota feature phrase 4 times and two one-offs', async () => {
    const { dump } = await world();
    const groups = dump['otherEntryGroups']!;
    const rota = groups.find((x) => x.field === 'feature' && /staff rota/i.test(x.normalised));
    expect(rota?.count).toBe(4);
    const oneOffs = groups.filter((x) => x.count === 1);
    expect(oneOffs).toHaveLength(2);
    expect(groups).toHaveLength(4);
    for (const g of groups)
      for (const tid of g.ticketIds) expect(dump['tickets']!.some((t) => t.id === tid)).toBe(true);
  });

  it('has 5 saved replies, at least one using the firstName placeholder', async () => {
    const { dump } = await world();
    expect(dump['savedReplies']).toHaveLength(5);
    expect(dump['savedReplies']!.some((r) => r.body.includes('{{firstName}}'))).toBe(true);
    expect(new Set(dump['savedReplies']!.map((r) => r.title)).size).toBe(5);
  });
});

describe('seeded comms, recovery, data requests and incidents', () => {
  it('has 2 announcements, exactly one live banner now', async () => {
    const { dump } = await world();
    const all = dump['announcements']!;
    expect(all).toHaveLength(2);
    const live = all.filter(
      (a) =>
        a.channels.includes('banner') &&
        new Date(a.publishAt).getTime() <= NOW &&
        (!a.expiresAt || new Date(a.expiresAt).getTime() > NOW),
    );
    expect(live).toHaveLength(1);
  });

  it('has 3 release notes dated no later than today', async () => {
    const { dump } = await world();
    expect(dump['releaseNotes']).toHaveLength(3);
    for (const n of dump['releaseNotes']!) expect(new Date(n.date).getTime()).toBeLessThanOrEqual(NOW);
  });

  it('has 1 open recovery request awaiting its second approval, approved by a provider user', async () => {
    const { dump } = await world();
    const reqs = dump['recoveryRequests']!;
    expect(reqs).toHaveLength(1);
    expect(reqs[0].status).toBe('open');
    expect(reqs[0].approvals).toHaveLength(1);
    const approver = dump['users']!.find((u) => u.id === reqs[0].approvals[0]);
    expect(approver?.side).toBe('provider');
    expect(dump['clients']!.some((x) => x.id === reqs[0].clientId)).toBe(true);
    const subject = dump['users']!.find((u) => u.id === reqs[0].subjectUserId);
    expect(subject?.clientId).toBe(reqs[0].clientId);
  });

  it('has 2 data requests, one open and due in 6 days', async () => {
    const { dump } = await world();
    const reqs = dump['dataRequests']!;
    expect(reqs).toHaveLength(2);
    const soon = reqs.filter((r) => r.status === 'open' && Math.round(daysFromNow(r.dueAt)) === 6);
    expect(soon).toHaveLength(1);
  });

  it('shows status Normal: no incident is unresolved, and there is a past resolved one', async () => {
    const { dump } = await world();
    const incidents = dump['incidents']!;
    expect(incidents.length).toBeGreaterThanOrEqual(1);
    for (const i of incidents) {
      expect(i.resolvedAt, i.title).toBeDefined();
      expect(i.updates.at(-1).status).toBe('resolved');
    }
  });
});

describe('seeded provider team', () => {
  it('has five provider users, Tom not enrolled in 2FA, and the Account manager custom role', async () => {
    const { dump, keys } = await world();
    const providers = dump['users']!.filter((u) => u.side === 'provider');
    expect(providers).toHaveLength(5);
    expect(providers.find((u) => u.id === keys.users['tom'])?.twoFactor).toBeUndefined();
    expect(providers.filter((u) => u.twoFactor).length).toBe(4);
    expect(keys.roles['provider.accountManager']).toBeDefined();
  });

  it('keeps every new client-owned record on a real client', async () => {
    const { dump } = await world();
    const clientIds = new Set(dump['clients']!.map((c) => c.id));
    for (const store of ['ownershipTransfers', 'recoveryRequests', 'profileChangeRequests', 'moduleNotices']) {
      for (const r of dump[store] ?? []) expect(clientIds.has(r.clientId), `${store} ${r.id}`).toBe(true);
    }
    for (const a of dump['priceAdjustments']!) for (const id of a.clientIds) expect(clientIds.has(id)).toBe(true);
  });
});
