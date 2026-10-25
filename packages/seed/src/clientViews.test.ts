// BP-4, F-4 (seed part): the Little Acorns seed world through the domain client views.
// Lives in the seed package because the domain package must not depend on the seed. Plan Assumptions 2 and 3.
// Uses the progress/client.ts API described in packages/domain/src/progress/client.test.ts.
import { describe, expect, it } from 'vitest';
import {
  complianceByRequirement, needsAttention, orgCompliance, recentlyCompleted, waitingForCheck,
  type Evidence, type EvidenceSubmission, type Person, type Requirement,
} from '@sta/domain';
import { seeded, TODAY } from './testing';

async function littleAcornsView() {
  const { dump, keys } = await seeded();
  const clientId = keys.clients['littleAcorns']!;
  const client = dump['clients'].find((c) => c.id === clientId);
  const people = (dump['people'] as Person[]).filter((p) => p.clientId === clientId);
  return {
    people,
    sites: dump['sites'].filter((s) => s.clientId === clientId),
    requirements: (dump['requirements'] as Requirement[]).filter((r) => r.packId === client.industryPackId),
    evidence: (dump['evidence'] as Evidence[]).filter((e) => e.clientId === clientId),
    submissions: (dump['evidenceSubmissions'] as EvidenceSubmission[]).filter((s) => s.clientId === clientId),
    now: new Date(TODAY),
    amberWindowDays: client.settings.amberWindowDays as number,
  };
}

describe('Little Acorns seed through the client views', () => {
  it('needs attention is exactly the six build pack 7.3 items, in order', async () => {
    const items = needsAttention(await littleAcornsView());
    expect(items.map((i) => [i.person.firstName, i.requirement.name, i.status])).toEqual([
      ['Mark', expect.stringMatching(/first aid/i), 'overdue'],
      ['Lucy', expect.stringMatching(/safeguarding/i), 'expiringSoon'],
      ['Hannah', expect.stringMatching(/safeguarding/i), 'expiringSoon'],
      ['Chris', expect.stringMatching(/safeguarding/i), 'expiringSoon'],
      ['Maureen', expect.stringMatching(/food hygiene/i), 'expiringSoon'],
      ['Amira', expect.stringMatching(/what changed/i), 'notStarted'],
    ]);
  });

  it('never lists Olivia (archived) and keeps Jade and Priya out of needs attention', async () => {
    const names = needsAttention(await littleAcornsView()).map((i) => i.person.firstName);
    expect(names).not.toContain('Olivia');
    expect(names).not.toContain('Jade');
    expect(names).not.toContain('Priya');
  });

  it('shows Ben alone under waiting for a check', async () => {
    const w = waitingForCheck(await littleAcornsView());
    expect(w.map((x) => x.person.firstName)).toEqual(['Ben']);
  });

  it('is 11 of 14 fully compliant, counting Grace on leave and not Olivia', async () => {
    const v = await littleAcornsView();
    expect(v.people.filter((p) => p.status !== 'archived' && p.status !== 'invited')).toHaveLength(14);
    expect(orgCompliance(v)).toEqual({ compliant: 11, total: 14 });
  });

  it('compliance by requirement counts the safeguarding expiries as expiring soon', async () => {
    const rows = complianceByRequirement(await littleAcornsView());
    const sg = rows.find((r) => /safeguarding/i.test(r.requirement.name));
    expect(sg?.counts.expiringSoon).toBeGreaterThanOrEqual(3);
    const total = rows.reduce((n, r) => n + r.applicable, 0);
    expect(total).toBeGreaterThan(14);
  });

  it('recently completed lists no archived people', async () => {
    const v = await littleAcornsView();
    const out = recentlyCompleted(v.evidence, v.people, v.now);
    expect(out.every((o) => o.person.status !== 'archived')).toBe(true);
  });
});
