// M4 chunk 1: schemas for the provider story (plan docs/plans/m4.md chunk 1; build pack section 6).
// Written before the implementation. Schema names and the optional fields marked "added" are the contract.
import { describe, expect, it } from 'vitest';
import {
  announcementSchema,
  dataRequestSchema,
  incidentSchema,
  linkCheckResultSchema,
  moduleNoticeSchema,
  otherEntryGroupSchema,
  ownershipTransferSchema,
  priceAdjustmentSchema,
  profileChangeRequestSchema,
  recoveryRequestSchema,
  releaseNoteSchema,
  savedReplySchema,
} from './index';

const id = (n: number): string => `01HZX00000000000000000${String(n).padStart(4, '0')}`;
const at = '2026-10-19T09:00:00.000Z';
const later = '2026-11-18T09:00:00.000Z';

describe('priceAdjustmentSchema', () => {
  const base = {
    id: id(1),
    clientIds: [id(2)],
    scope: { kind: 'plan' as const },
    type: 'percent' as const,
    value: -10,
    reason: 'loyalty' as const,
    noticeDays: 30,
    status: 'draft' as const,
    createdBy: id(3),
  };

  it('accepts a draft percentage change and an add-on scoped override', () => {
    expect(priceAdjustmentSchema.safeParse(base).success).toBe(true);
    expect(
      priceAdjustmentSchema.safeParse({
        ...base,
        scope: { kind: 'addOn', addOnId: id(4) },
        type: 'override',
        value: 1500,
        effectiveAt: at,
        endsAt: later,
        status: 'scheduled',
        confirmedBy: id(5),
        confirmedAt: at,
      }).success,
    ).toBe(true);
  });

  it('defaults noticeDays to 30 when it is left out (assumption 6)', () => {
    const { noticeDays: _omit, ...rest } = base;
    expect(priceAdjustmentSchema.parse(rest).noticeDays).toBe(30);
  });

  it.each(['draft', 'submitted', 'scheduled', 'active', 'ended', 'cancelled'])('accepts status %s', (status) => {
    expect(priceAdjustmentSchema.safeParse({ ...base, status }).success).toBe(true);
  });

  it('refuses an unknown status, reason or scope kind', () => {
    expect(priceAdjustmentSchema.safeParse({ ...base, status: 'awaitingConfirmation' }).success).toBe(false);
    expect(priceAdjustmentSchema.safeParse({ ...base, reason: 'birthday' }).success).toBe(false);
    expect(priceAdjustmentSchema.safeParse({ ...base, scope: { kind: 'everything' } }).success).toBe(false);
  });

  it('refuses no clients, a negative notice, a negative override or a percentage below minus 100', () => {
    expect(priceAdjustmentSchema.safeParse({ ...base, clientIds: [] }).success).toBe(false);
    expect(priceAdjustmentSchema.safeParse({ ...base, noticeDays: -1 }).success).toBe(false);
    expect(priceAdjustmentSchema.safeParse({ ...base, type: 'override', value: -100 }).success).toBe(false);
    expect(priceAdjustmentSchema.safeParse({ ...base, value: -101 }).success).toBe(false);
  });

  it('refuses a fractional override in pence', () => {
    expect(priceAdjustmentSchema.safeParse({ ...base, type: 'override', value: 10.5 }).success).toBe(false);
  });

  it('refuses an end date that is not after the effective date', () => {
    expect(priceAdjustmentSchema.safeParse({ ...base, effectiveAt: later, endsAt: at }).success).toBe(false);
    expect(priceAdjustmentSchema.safeParse({ ...base, effectiveAt: at, endsAt: at }).success).toBe(false);
  });

  it('refuses a scheduled or active change with no confirmer or no effective date', () => {
    expect(priceAdjustmentSchema.safeParse({ ...base, status: 'scheduled', effectiveAt: at }).success).toBe(false);
    expect(
      priceAdjustmentSchema.safeParse({ ...base, status: 'active', confirmedBy: id(5), confirmedAt: at }).success,
    ).toBe(false);
  });
});

describe('ownershipTransferSchema', () => {
  const base = {
    id: id(10),
    side: 'client' as const,
    clientId: id(2),
    fromUserId: id(11),
    toUserId: id(12),
    coolingOffEndsAt: later,
    demoteFromTo: id(13),
    status: 'pending' as const,
  };

  it('accepts a pending client transfer and a provider transfer with no clientId', () => {
    expect(ownershipTransferSchema.safeParse(base).success).toBe(true);
    const { clientId: _c, ...rest } = base;
    expect(ownershipTransferSchema.safeParse({ ...rest, side: 'provider' }).success).toBe(true);
  });

  it('records acceptance and simulated 2FA confirmation as optional dates (added)', () => {
    const r = ownershipTransferSchema.safeParse({ ...base, acceptedAt: at, twoFactorConfirmedAt: at });
    expect(r.success).toBe(true);
    expect(ownershipTransferSchema.parse(base).acceptedAt).toBeUndefined();
  });

  it('refuses a client transfer with no clientId', () => {
    const { clientId: _c, ...rest } = base;
    expect(ownershipTransferSchema.safeParse(rest).success).toBe(false);
  });

  it('refuses a transfer from a user to themselves', () => {
    expect(ownershipTransferSchema.safeParse({ ...base, toUserId: base.fromUserId }).success).toBe(false);
  });

  it('refuses an unknown status', () => {
    expect(ownershipTransferSchema.safeParse({ ...base, status: 'accepted' }).success).toBe(false);
  });
});

describe('announcementSchema', () => {
  const base = {
    id: id(20),
    title: 'New Fire evacuation module',
    body: 'A new module is ready to assign.',
    audience: { sides: ['client' as const] },
    channels: ['banner' as const],
    publishAt: at,
    createdBy: id(21),
    reads: 0,
  };

  it('accepts a banner for chosen clients, packages and packs', () => {
    expect(
      announcementSchema.safeParse({
        ...base,
        audience: { clientIds: [id(2)], packageIds: [id(3)], packIds: [id(4)], sides: ['staff', 'client'] },
        channels: ['banner', 'notification', 'email'],
        expiresAt: later,
        link: '#/client/help',
      }).success,
    ).toBe(true);
  });

  it('refuses an audience with no sides or no channels', () => {
    expect(announcementSchema.safeParse({ ...base, audience: { sides: [] } }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...base, channels: [] }).success).toBe(false);
  });

  it('refuses a provider side in the audience, an empty title and a negative read count', () => {
    expect(announcementSchema.safeParse({ ...base, audience: { sides: ['provider'] } }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...base, title: '' }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...base, reads: -1 }).success).toBe(false);
  });

  it('refuses an expiry that is not after publishing', () => {
    expect(announcementSchema.safeParse({ ...base, expiresAt: at }).success).toBe(false);
  });
});

describe('releaseNoteSchema', () => {
  it('accepts a note with feedback and module version links, and refuses a bad version', () => {
    const base = {
      id: id(30),
      title: 'What changed in October 2026',
      body: 'Fixes and a new module.',
      date: at,
      feedbackIds: [id(31)],
      moduleVersions: [{ moduleId: id(32), version: 2 }],
    };
    expect(releaseNoteSchema.safeParse(base).success).toBe(true);
    expect(releaseNoteSchema.safeParse({ ...base, moduleVersions: [{ moduleId: id(32), version: 0 }] }).success).toBe(
      false,
    );
  });
});

describe('recoveryRequestSchema', () => {
  const base = {
    id: id(40),
    clientId: id(2),
    subjectUserId: id(41),
    requester: 'Priya (phone call)',
    reason: 'Lost phone, cannot use the 2FA code',
    checks: [{ key: 'callBack', doneBy: id(42), at }],
    approvals: [id(42)],
    status: 'open' as const,
  };

  it('accepts an open request with one approval and a completed one with an outcome', () => {
    expect(recoveryRequestSchema.safeParse(base).success).toBe(true);
    expect(
      recoveryRequestSchema.safeParse({
        ...base,
        approvals: [id(42), id(43)],
        coolingOffEndsAt: later,
        outcome: 'reset2fa',
        status: 'done',
      }).success,
    ).toBe(true);
  });

  it('refuses the same approver listed twice', () => {
    expect(recoveryRequestSchema.safeParse({ ...base, approvals: [id(42), id(42)] }).success).toBe(false);
  });

  it('refuses approved or done with fewer than two approvals', () => {
    expect(recoveryRequestSchema.safeParse({ ...base, status: 'approved' }).success).toBe(false);
    expect(recoveryRequestSchema.safeParse({ ...base, status: 'done', outcome: 'reset2fa' }).success).toBe(false);
  });

  it('refuses a subject who is also an approver (assumption 5)', () => {
    expect(recoveryRequestSchema.safeParse({ ...base, approvals: [id(41), id(42)], status: 'approved' }).success).toBe(
      false,
    );
  });

  it('refuses an unknown outcome', () => {
    expect(recoveryRequestSchema.safeParse({ ...base, outcome: 'deleteAccount' }).success).toBe(false);
  });
});

describe('dataRequestSchema', () => {
  const base = {
    id: id(50),
    kind: 'access' as const,
    requester: 'A former employee',
    receivedAt: at,
    dueAt: later,
    status: 'open' as const,
    notes: '',
  };

  it('accepts a request with or without a client', () => {
    expect(dataRequestSchema.safeParse(base).success).toBe(true);
    expect(dataRequestSchema.safeParse({ ...base, clientId: id(2), subjectPersonId: id(51) }).success).toBe(true);
  });

  it('refuses a due date before it was received and an unknown kind', () => {
    expect(dataRequestSchema.safeParse({ ...base, dueAt: '2026-10-01T09:00:00.000Z' }).success).toBe(false);
    expect(dataRequestSchema.safeParse({ ...base, kind: 'sale' }).success).toBe(false);
  });
});

describe('incidentSchema', () => {
  const base = {
    id: id(60),
    level: 'degraded' as const,
    title: 'Slow certificate downloads',
    updates: [{ status: 'investigating' as const, message: 'We are looking into it.', at }],
    startedAt: at,
  };

  it('accepts an open incident and a resolved one', () => {
    expect(incidentSchema.safeParse(base).success).toBe(true);
    expect(
      incidentSchema.safeParse({
        ...base,
        updates: [...base.updates, { status: 'resolved' as const, message: 'Fixed.', at: later }],
        resolvedAt: later,
      }).success,
    ).toBe(true);
  });

  it('refuses an incident with no updates, an unknown level or a resolve date before the start', () => {
    expect(incidentSchema.safeParse({ ...base, updates: [] }).success).toBe(false);
    expect(incidentSchema.safeParse({ ...base, level: 'outage' }).success).toBe(false);
    expect(incidentSchema.safeParse({ ...base, resolvedAt: '2026-10-01T09:00:00.000Z' }).success).toBe(false);
  });
});

describe('otherEntryGroupSchema', () => {
  const base = {
    id: id(70),
    field: 'issueType' as const,
    normalised: "certificate won't download",
    examples: ["Certificate won't download", 'cert wont download'],
    ticketIds: [id(71), id(72)],
    count: 2,
    firstSeen: at,
    lastSeen: later,
    review: 'unreviewed' as const,
  };

  it('accepts an unreviewed group and a created one with an outcome id', () => {
    expect(otherEntryGroupSchema.safeParse(base).success).toBe(true);
    expect(otherEntryGroupSchema.safeParse({ ...base, review: 'created', outcomeId: id(73) }).success).toBe(true);
  });

  it('refuses a count that differs from the number of tickets', () => {
    expect(otherEntryGroupSchema.safeParse({ ...base, count: 3 }).success).toBe(false);
  });

  it('refuses a last seen before first seen, an empty phrase and an unknown field or review state', () => {
    expect(otherEntryGroupSchema.safeParse({ ...base, firstSeen: later, lastSeen: at }).success).toBe(false);
    expect(otherEntryGroupSchema.safeParse({ ...base, normalised: '' }).success).toBe(false);
    expect(otherEntryGroupSchema.safeParse({ ...base, field: 'priority' }).success).toBe(false);
    expect(otherEntryGroupSchema.safeParse({ ...base, review: 'done' }).success).toBe(false);
  });
});

describe('savedReplySchema', () => {
  it('accepts a reply that uses the firstName placeholder and refuses an empty body or title', () => {
    expect(savedReplySchema.safeParse({ id: id(80), title: 'Thanks', body: 'Hi {{firstName}}, thanks.' }).success).toBe(
      true,
    );
    expect(savedReplySchema.safeParse({ id: id(80), title: 'Thanks', body: '' }).success).toBe(false);
    expect(savedReplySchema.safeParse({ id: id(80), title: '', body: 'Hi' }).success).toBe(false);
  });
});

describe('profileChangeRequestSchema', () => {
  const base = {
    id: id(90),
    clientId: id(2),
    kind: 'nameChange' as const,
    oldName: 'Oak Tree Nurseries',
    newName: 'Oak Tree Nurseries Group',
    requestedBy: id(91),
    status: 'pendingReview' as const,
    createdAt: at,
  };

  it('accepts a pending name change and a reviewed one', () => {
    expect(profileChangeRequestSchema.safeParse(base).success).toBe(true);
    expect(
      profileChangeRequestSchema.safeParse({ ...base, status: 'billingUpdated', reviewerId: id(92), reviewedAt: later })
        .success,
    ).toBe(true);
  });

  it.each(['pendingReview', 'billingKept', 'billingUpdated', 'clientAsked', 'reverted'])('accepts status %s', (s) => {
    expect(profileChangeRequestSchema.safeParse({ ...base, status: s }).success).toBe(true);
  });

  it('refuses a missing clientId, an empty new name, an unchanged name and an unknown status', () => {
    const { clientId: _c, ...rest } = base;
    expect(profileChangeRequestSchema.safeParse(rest).success).toBe(false);
    expect(profileChangeRequestSchema.safeParse({ ...base, newName: '' }).success).toBe(false);
    expect(profileChangeRequestSchema.safeParse({ ...base, newName: base.oldName }).success).toBe(false);
    expect(profileChangeRequestSchema.safeParse({ ...base, status: 'pending' }).success).toBe(false);
  });
});

describe('linkCheckResultSchema', () => {
  const base = {
    id: id(100),
    linkId: id(101),
    moduleId: id(102),
    url: 'https://www.gov.uk/example',
    status: 'broken' as const,
    checkedAt: at,
  };

  it('accepts ok, broken and unknown results', () => {
    for (const status of ['ok', 'broken', 'unknown'] as const) {
      expect(linkCheckResultSchema.safeParse({ ...base, status }).success).toBe(true);
    }
  });

  it('refuses an unknown status and a missing link id', () => {
    expect(linkCheckResultSchema.safeParse({ ...base, status: 'slow' }).success).toBe(false);
    const { linkId: _l, ...rest } = base;
    expect(linkCheckResultSchema.safeParse(rest).success).toBe(false);
  });
});

describe('moduleNoticeSchema (what changed notice, one per targeted client)', () => {
  const base = {
    id: id(110),
    clientId: id(2),
    moduleId: id(111),
    fromVersion: 1,
    toVersion: 2,
    summary: 'Updated for the new guidance.',
    publishedBy: id(112),
    publishedAt: at,
  };

  it('accepts a notice, seen or unseen, and carries a clientId', () => {
    expect(moduleNoticeSchema.safeParse(base).success).toBe(true);
    expect(moduleNoticeSchema.safeParse({ ...base, seenAt: later, seenBy: id(113) }).success).toBe(true);
    const { clientId: _c, ...rest } = base;
    expect(moduleNoticeSchema.safeParse(rest).success).toBe(false);
  });

  it('refuses a version that does not go up and an empty summary', () => {
    expect(moduleNoticeSchema.safeParse({ ...base, toVersion: 1 }).success).toBe(false);
    expect(moduleNoticeSchema.safeParse({ ...base, summary: '' }).success).toBe(false);
  });
});
