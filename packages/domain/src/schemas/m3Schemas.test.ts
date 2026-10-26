// M3 chunk 1: schema additions and new schemas (plan docs/plans/m3.md "Domain package"; assumptions 3, 19, 40 to 43, 50, 51).
// Written before the implementation.
import { describe, expect, it } from 'vitest';
import {
  addOnRequestSchema,
  appFeedbackSchema,
  attachmentSchema,
  autoAssignRuleSchema,
  billingChangeRequestSchema,
  billingProfileSchema,
  clientSettingsSchema,
  demoStateSchema,
  faqVoteSchema,
  invitationSchema,
  invoiceSchema,
  moduleDraftSchema,
  moduleFeedbackSchema,
  moduleSchema,
  moduleVersionSchema,
  onboardingChecklistSchema,
  reminderLogSchema,
  retentionPolicySchema,
  subscriptionSchema,
  themeSchema,
  ticketMessageSchema,
  ticketSchema,
  userAccountSchema,
} from './index';
import { mcq, moduleWith } from '../quiz/testFixtures';

const id = (n: number): string => `01HZX00000000000000000${String(n).padStart(4, '0')}`;
const at = '2026-10-19T09:00:00.000Z';

describe('clientSettingsSchema M3 additions', () => {
  it('defaults firstAiderThreshold to 2 and reminderTemplates to empty', () => {
    const s = clientSettingsSchema.parse({});
    expect(s.firstAiderThreshold).toBe(2);
    expect(s.themeId).toBeUndefined();
    expect(s.reminderTemplates).toEqual({});
  });

  it.each([0, 2, 20])('accepts firstAiderThreshold %i', (n) => {
    expect(clientSettingsSchema.safeParse({ firstAiderThreshold: n }).success).toBe(true);
  });

  it.each([-1, 21, 1.5])('refuses firstAiderThreshold %s', (n) => {
    expect(clientSettingsSchema.safeParse({ firstAiderThreshold: n }).success).toBe(false);
  });

  it('accepts a theme id and a reminder template with a tone and optional text', () => {
    const r = clientSettingsSchema.safeParse({
      themeId: id(1),
      reminderTemplates: { due: { tone: 'brief' }, expiring: { tone: 'neutral', text: 'Please renew.' } },
    });
    expect(r.success).toBe(true);
  });

  it('refuses an unknown reminder tone', () => {
    expect(clientSettingsSchema.safeParse({ reminderTemplates: { due: { tone: 'shouty' } } }).success).toBe(false);
  });
});

describe('retentionPolicySchema bounds (assumption 50)', () => {
  const ok = {
    leaverRecordsMonths: 72,
    notesAfterLeaveDays: 30,
    eventDetailMonths: 24,
    feedbackMonths: 24,
    ticketMonthsAfterClose: 24,
    attachmentDaysAfterClose: 90,
    trialDeleteDays: 30,
  };

  it('accepts the defaults and the edges of every bound', () => {
    expect(retentionPolicySchema.safeParse(ok).success).toBe(true);
    expect(
      retentionPolicySchema.safeParse({
        ...ok,
        leaverRecordsMonths: 12,
        notesAfterLeaveDays: 30,
        eventDetailMonths: 13,
        feedbackMonths: 12,
      }).success,
    ).toBe(true);
    expect(
      retentionPolicySchema.safeParse({
        ...ok,
        leaverRecordsMonths: 120,
        notesAfterLeaveDays: 365,
        eventDetailMonths: 60,
        feedbackMonths: 60,
      }).success,
    ).toBe(true);
  });

  it.each([
    ['leaverRecordsMonths', 11],
    ['leaverRecordsMonths', 121],
    ['notesAfterLeaveDays', 29],
    ['notesAfterLeaveDays', 366],
    ['eventDetailMonths', 12],
    ['eventDetailMonths', 61],
    ['feedbackMonths', 11],
    ['feedbackMonths', 61],
  ])('refuses %s of %i', (field, value) => {
    expect(retentionPolicySchema.safeParse({ ...ok, [field]: value }).success).toBe(false);
  });
});

describe('userAccountSchema two-factor additions (assumption 3, 4)', () => {
  const user = {
    id: id(1),
    side: 'client',
    clientId: id(2),
    displayName: 'Priya',
    status: 'active',
    login: { method: 'emailPassword', pinSet: false },
  };

  it('accepts twoFactorRequiredSince on a client admin', () => {
    expect(userAccountSchema.safeParse({ ...user, twoFactorRequiredSince: at }).success).toBe(true);
  });

  it('still parses a user with neither field', () => {
    expect(userAccountSchema.safeParse(user).success).toBe(true);
  });

  it('accepts recovery code hashes, lock time and failed code count on an enrolled user', () => {
    const r = userAccountSchema.safeParse({
      ...user,
      twoFactor: {
        enrolledAt: at,
        recoveryCodesLeft: 2,
        recoveryCodeHashes: ['a'.repeat(64), 'b'.repeat(64)],
        lockedUntil: at,
        failedCodes: 3,
      },
    });
    expect(r.success).toBe(true);
  });

  it('refuses a negative failed code count and non-text hashes', () => {
    const base = { enrolledAt: at, recoveryCodesLeft: 1 };
    expect(userAccountSchema.safeParse({ ...user, twoFactor: { ...base, failedCodes: -1 } }).success).toBe(false);
    expect(userAccountSchema.safeParse({ ...user, twoFactor: { ...base, recoveryCodeHashes: [1] } }).success).toBe(
      false,
    );
  });
});

describe('moduleSchema M3 additions', () => {
  const base = moduleWith([mcq('m1')]);

  it('accepts updatedAt, duplicatedFrom and optional', () => {
    const r = moduleSchema.safeParse({
      ...base,
      updatedAt: at,
      duplicatedFrom: { moduleId: id(5), version: 2 },
      optional: true,
    });
    expect(r.success).toBe(true);
  });

  it('still parses a module without the new fields', () => {
    expect(moduleSchema.safeParse(base).success).toBe(true);
  });

  it('refuses a malformed duplicatedFrom', () => {
    expect(moduleSchema.safeParse({ ...base, duplicatedFrom: { moduleId: id(5) } }).success).toBe(false);
  });
});

describe('moduleDraftSchema and moduleVersionSchema (assumption 11)', () => {
  // A client's own module: its draft must name the client. (A provider module's draft carries none; tested below.)
  const module = { ...moduleWith([mcq('m1')]), owner: { clientId: id(2) } };
  const draft = { moduleId: id(1), clientId: id(2), module, updatedBy: id(3), updatedAt: at };

  it('accepts a draft keyed by module id and requires clientId', () => {
    expect(moduleDraftSchema.safeParse(draft).success).toBe(true);
    const { clientId: _c, ...bad } = draft;
    expect(moduleDraftSchema.safeParse(bad).success).toBe(false);
  });

  it('lets a provider-authored module draft carry no clientId', () => {
    const { clientId: _c, ...rest } = draft;
    expect(moduleDraftSchema.safeParse({ ...rest, module: { ...module, owner: 'provider' as const } }).success).toBe(
      true,
    );
  });

  it('lets a draft hold a module that would fail the publish checks (no status checks)', () => {
    const unfinished = { ...module, status: 'draft', questions: [], lessons: [] };
    expect(moduleDraftSchema.safeParse({ ...draft, module: unfinished }).success).toBe(true);
  });

  it('accepts a version snapshot and refuses version 0', () => {
    const v = { key: `${id(1)}:2`, moduleId: id(1), version: 2, module, publishedAt: at };
    expect(moduleVersionSchema.safeParse(v).success).toBe(true);
    expect(moduleVersionSchema.safeParse({ ...v, version: 0 }).success).toBe(false);
  });
});

describe('attachmentSchema union (assumption 19)', () => {
  const doc = { id: id(1), clientId: id(2), title: 'Policy', mime: 'text/markdown', body: '# Hi', createdAt: at };
  const file = {
    id: id(1),
    clientId: id(2),
    kind: 'file',
    purpose: 'certificate',
    title: 'Certificate',
    mime: 'application/pdf',
    bytes: 1200,
    data: new Uint8Array([37, 80, 68, 70]),
    ownerUserId: id(3),
    personId: id(4),
    redacted: false,
    createdAt: at,
  };

  it('parses an M1 markdown record without kind and gives it kind document', () => {
    const r = attachmentSchema.parse(doc);
    expect(r.kind).toBe('document');
  });

  it.each(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])('accepts a file of type %s', (mime) => {
    expect(attachmentSchema.safeParse({ ...file, mime }).success).toBe(true);
  });

  it.each(['certificate', 'ticketScreenshot', 'learningDocument'])('accepts purpose %s', (purpose) => {
    expect(attachmentSchema.safeParse({ ...file, purpose }).success).toBe(true);
  });

  it.each([
    ['html', { mime: 'text/html' }],
    ['gif', { mime: 'image/gif' }],
    ['unknown purpose', { purpose: 'avatar' }],
    ['text instead of bytes', { data: 'abc' }],
    ['no owner', { ownerUserId: undefined }],
  ])('refuses a file with %s', (_n, patch) => {
    expect(attachmentSchema.safeParse({ ...file, ...patch }).success).toBe(false);
  });

  it('refuses a markdown document that claims kind file', () => {
    expect(attachmentSchema.safeParse({ ...doc, kind: 'file' }).success).toBe(false);
  });
});

describe('autoAssignRuleSchema (assumption on rules)', () => {
  const rule = {
    id: id(1),
    clientId: id(2),
    name: 'New starters get safeguarding',
    enabled: true,
    trigger: { type: 'personAdded' },
    filters: {},
    action: { moduleId: id(3) },
    dueInDays: 14,
  };

  it('accepts a rule with a module action and one with a group action', () => {
    expect(autoAssignRuleSchema.safeParse(rule).success).toBe(true);
    expect(autoAssignRuleSchema.safeParse({ ...rule, action: { groupId: id(4) } }).success).toBe(true);
  });

  it('accepts requirementExpiring with days 1 to 365 and refuses 0 and 366', () => {
    const t = (days: number) => ({ ...rule, trigger: { type: 'requirementExpiring', days, requirementId: id(5) } });
    expect(autoAssignRuleSchema.safeParse(t(1)).success).toBe(true);
    expect(autoAssignRuleSchema.safeParse(t(365)).success).toBe(true);
    expect(autoAssignRuleSchema.safeParse(t(0)).success).toBe(false);
    expect(autoAssignRuleSchema.safeParse(t(366)).success).toBe(false);
  });

  it('bounds dueInDays to 0 to 365 and name to 1 to 80 characters', () => {
    expect(autoAssignRuleSchema.safeParse({ ...rule, dueInDays: 0 }).success).toBe(true);
    expect(autoAssignRuleSchema.safeParse({ ...rule, dueInDays: 365 }).success).toBe(true);
    expect(autoAssignRuleSchema.safeParse({ ...rule, dueInDays: -1 }).success).toBe(false);
    expect(autoAssignRuleSchema.safeParse({ ...rule, dueInDays: 366 }).success).toBe(false);
    expect(autoAssignRuleSchema.safeParse({ ...rule, name: '' }).success).toBe(false);
    expect(autoAssignRuleSchema.safeParse({ ...rule, name: 'x'.repeat(81) }).success).toBe(false);
    expect(autoAssignRuleSchema.safeParse({ ...rule, name: 'x'.repeat(80) }).success).toBe(true);
  });

  it('refuses an unknown trigger and a rule with no clientId', () => {
    expect(autoAssignRuleSchema.safeParse({ ...rule, trigger: { type: 'birthday' } }).success).toBe(false);
    const { clientId: _c, ...bad } = rule;
    expect(autoAssignRuleSchema.safeParse(bad).success).toBe(false);
  });
});

describe('reminderLogSchema', () => {
  const log = {
    key: `${id(2)}:${id(3)}:due:2026-W43`,
    clientId: id(1),
    personId: id(3),
    kind: 'due',
    sentAt: at,
    weekKey: '2026-W43',
  };
  it('accepts a log entry and requires clientId, personId and weekKey', () => {
    expect(reminderLogSchema.safeParse(log).success).toBe(true);
    for (const f of ['clientId', 'personId', 'weekKey', 'key']) {
      expect(reminderLogSchema.safeParse({ ...log, [f]: undefined }).success, f).toBe(false);
    }
  });
});

describe('themeSchema (assumption 51)', () => {
  const theme = {
    id: id(1),
    clientId: id(2),
    name: 'Autumn',
    tokens: { primary: '#336699', accent: '#aa5500', backgroundTint: '#f5f0e8', radius: 'md' },
    appliesTo: { staff: true, admin: false },
  };

  it('accepts a theme with allowlisted tokens', () => {
    expect(themeSchema.safeParse(theme).success).toBe(true);
  });

  it('accepts a preset and a schedule whose end is after the start', () => {
    const r = themeSchema.safeParse({
      ...theme,
      preset: 'autumn',
      schedule: { startAt: at, endAt: '2026-11-19T09:00:00.000Z' },
    });
    expect(r.success).toBe(true);
  });

  it('refuses a schedule that ends before or at its start', () => {
    expect(
      themeSchema.safeParse({ ...theme, schedule: { startAt: at, endAt: '2026-10-01T09:00:00.000Z' } }).success,
    ).toBe(false);
    expect(themeSchema.safeParse({ ...theme, schedule: { startAt: at, endAt: at } }).success).toBe(false);
  });

  it.each(['danger', 'success', 'error', 'warning', 'position', 'fontFamily'])(
    'refuses the token %s (not on the allowlist)',
    (token) => {
      expect(themeSchema.safeParse({ ...theme, tokens: { ...theme.tokens, [token]: '#ff0000' } }).success).toBe(false);
    },
  );

  it('refuses a radius outside sm, md and lg', () => {
    expect(themeSchema.safeParse({ ...theme, tokens: { ...theme.tokens, radius: 'xl' } }).success).toBe(false);
  });

  it('requires appliesTo', () => {
    const { appliesTo: _a, ...bad } = theme;
    expect(themeSchema.safeParse(bad).success).toBe(false);
  });
});

describe('invitationSchema and onboardingChecklistSchema', () => {
  const invite = {
    id: id(1),
    side: 'client',
    clientId: id(2),
    email: 'new.admin@example.test',
    roleIds: [id(3)],
    scope: { type: 'clients', ids: [id(2)] },
    invitedBy: id(4),
    expiresAt: '2026-11-02T09:00:00.000Z',
    status: 'invited',
  };

  it('accepts an invitation and refuses an unknown status', () => {
    expect(invitationSchema.safeParse(invite).success).toBe(true);
    expect(invitationSchema.safeParse({ ...invite, status: 'pending' }).success).toBe(false);
  });

  it('refuses a client invitation with no clientId', () => {
    const { clientId: _c, ...bad } = invite;
    expect(invitationSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts a checklist keyed by clientId with steps that may be done', () => {
    const c = {
      clientId: id(2),
      steps: [{ key: 'inviteStaff', doneAt: at }, { key: 'exportMatrix' }],
      startedAt: at,
    };
    expect(onboardingChecklistSchema.safeParse(c).success).toBe(true);
    expect(onboardingChecklistSchema.safeParse({ ...c, steps: [{ doneAt: at }] }).success).toBe(false);
  });
});

describe('addOnRequestSchema (assumption 43)', () => {
  const req = { id: id(1), clientId: id(2), addOnId: id(3), requestedBy: id(4), status: 'pending', createdAt: at };

  it('accepts a pending request with no note', () => {
    expect(addOnRequestSchema.safeParse(req).success).toBe(true);
  });

  it('accepts a decided request and a note of up to 300 characters', () => {
    expect(
      addOnRequestSchema.safeParse({
        ...req,
        status: 'approved',
        decidedBy: id(5),
        decidedAt: at,
        note: 'x'.repeat(300),
      }).success,
    ).toBe(true);
  });

  it('refuses a note over 300 characters and an unknown status', () => {
    expect(addOnRequestSchema.safeParse({ ...req, note: 'x'.repeat(301) }).success).toBe(false);
    expect(addOnRequestSchema.safeParse({ ...req, status: 'maybe' }).success).toBe(false);
  });
});

describe('billing schemas (assumptions 40, 41)', () => {
  const invoice = {
    id: id(1),
    number: 'INV-0001',
    clientId: id(2),
    issuedAt: at,
    dueAt: '2026-11-02T09:00:00.000Z',
    billingNameAtIssue: 'Little Acorns Ltd',
    billingAddressAtIssue: '1 Example Road',
    lines: [
      { label: 'Standard plan, Main site', amount: 5000, siteId: id(3) },
      { label: 'Extra', amount: 1000 },
    ],
    tax: 1200,
    total: 7200,
    status: 'due',
  };

  it('accepts an invoice and each status', () => {
    for (const status of ['paid', 'due', 'overdue', 'refunded']) {
      expect(invoiceSchema.safeParse({ ...invoice, status }).success, status).toBe(true);
    }
  });

  it('refuses an invoice with a bad status, a negative tax or no clientId', () => {
    expect(invoiceSchema.safeParse({ ...invoice, status: 'unpaid' }).success).toBe(false);
    expect(invoiceSchema.safeParse({ ...invoice, tax: -1 }).success).toBe(false);
    const { clientId: _c, ...bad } = invoice;
    expect(invoiceSchema.safeParse(bad).success).toBe(false);
  });

  const profile = {
    clientId: id(2),
    billingName: 'Little Acorns Ltd',
    address: '1 Example Road',
    billingContactEmail: 'accounts@example.test',
    updatedBy: id(4),
    updatedAt: at,
  };

  it('accepts a billing profile with and without the mock payment method', () => {
    expect(billingProfileSchema.safeParse(profile).success).toBe(true);
    expect(
      billingProfileSchema.safeParse({
        ...profile,
        paymentMethod: { brand: 'Demo card', last4: '4242', expMonth: 12, expYear: 2030 },
      }).success,
    ).toBe(true);
  });

  it('never stores a full card number: refuses a last4 that is not four digits', () => {
    const pm = (last4: string) => ({
      ...profile,
      paymentMethod: { brand: 'Demo card', last4, expMonth: 12, expYear: 2030 },
    });
    expect(billingProfileSchema.safeParse(pm('4242424242424242')).success).toBe(false);
    expect(billingProfileSchema.safeParse(pm('42')).success).toBe(false);
    expect(billingProfileSchema.safeParse(pm('abcd')).success).toBe(false);
  });

  it('refuses an expiry month of 13', () => {
    expect(
      billingProfileSchema.safeParse({
        ...profile,
        paymentMethod: { brand: 'Demo card', last4: '4242', expMonth: 13, expYear: 2030 },
      }).success,
    ).toBe(false);
  });

  it('accepts a billing change request and refuses an unknown status', () => {
    const r = {
      id: id(1),
      clientId: id(2),
      requestedBy: id(4),
      proposed: { billingName: 'New Name Ltd' },
      status: 'pending',
      createdAt: at,
    };
    expect(billingChangeRequestSchema.safeParse(r).success).toBe(true);
    expect(billingChangeRequestSchema.safeParse({ ...r, status: 'open' }).success).toBe(false);
    expect(
      billingChangeRequestSchema.safeParse({ ...r, proposed: { billingContactEmail: 'x@example.test' } }).success,
    ).toBe(false);
  });

  it('subscriptionSchema accepts pendingPackageId', () => {
    const sub = {
      clientId: id(2),
      packageId: id(3),
      period: 'monthly',
      renewalAt: at,
      state: 'active',
      stateSince: at,
      billingContact: 'accounts@example.test',
    };
    expect(subscriptionSchema.safeParse({ ...sub, pendingPackageId: id(9) }).success).toBe(true);
    expect(subscriptionSchema.safeParse({ ...sub, pendingPackageId: 5 }).success).toBe(false);
  });
});

describe('support schemas (assumptions on feedback and tickets)', () => {
  const card = {
    id: id(1),
    clientId: id(2),
    siteId: id(3),
    personId: id(4),
    anonymous: false,
    moduleId: id(5),
    moduleVersion: 1,
    kind: 'moduleCard',
    rating: 4,
    tags: ['clear'],
    status: 'new',
    createdAt: at,
  };

  it('accepts a named module card with a rating', () => {
    expect(moduleFeedbackSchema.safeParse(card).success).toBe(true);
  });

  it('accepts an anonymous item with no personId', () => {
    const { personId: _p, ...rest } = card;
    expect(moduleFeedbackSchema.safeParse({ ...rest, anonymous: true }).success).toBe(true);
  });

  it('refuses an anonymous item that carries a personId', () => {
    expect(moduleFeedbackSchema.safeParse({ ...card, anonymous: true }).success).toBe(false);
  });

  it('accepts a lesson thumb and a question report with their ids, and refuses a thumb without a lesson', () => {
    expect(
      moduleFeedbackSchema.safeParse({
        ...card,
        kind: 'lessonThumb',
        lessonId: 'lesson-1',
        thumb: 'up',
        rating: undefined,
      }).success,
    ).toBe(true);
    expect(
      moduleFeedbackSchema.safeParse({
        ...card,
        kind: 'questionReport',
        questionId: 'm1',
        text: 'Unclear',
        rating: undefined,
      }).success,
    ).toBe(true);
    expect(
      moduleFeedbackSchema.safeParse({ ...card, kind: 'lessonThumb', thumb: 'up', rating: undefined }).success,
    ).toBe(false);
  });

  it('refuses a rating outside 1 to 5', () => {
    expect(moduleFeedbackSchema.safeParse({ ...card, rating: 0 }).success).toBe(false);
    expect(moduleFeedbackSchema.safeParse({ ...card, rating: 6 }).success).toBe(false);
  });

  it('accepts app feedback without a client and refuses an unknown kind', () => {
    const f = {
      id: id(1),
      userId: id(2),
      side: 'client',
      kind: 'idea',
      text: 'More colours',
      context: {},
      status: 'new',
      tags: [],
      createdAt: at,
    };
    expect(appFeedbackSchema.safeParse(f).success).toBe(true);
    expect(appFeedbackSchema.safeParse({ ...f, kind: 'rant' }).success).toBe(false);
  });

  const ticket = {
    id: id(1),
    number: 'T-0001',
    clientId: id(2),
    raisedBy: id(3),
    raiserSide: 'client',
    sharedWithManager: false,
    title: 'Cannot find the matrix',
    description: 'I looked in Reports.',
    impact: 'question',
    priority: 'normal',
    status: 'received',
    tags: [],
    context: {},
    linkedErrorIds: [],
    createdAt: at,
    updatedAt: at,
  };

  it('accepts a ticket and refuses an unknown status, impact or priority', () => {
    expect(ticketSchema.safeParse(ticket).success).toBe(true);
    expect(ticketSchema.safeParse({ ...ticket, status: 'open' }).success).toBe(false);
    expect(ticketSchema.safeParse({ ...ticket, impact: 'huge' }).success).toBe(false);
    expect(ticketSchema.safeParse({ ...ticket, priority: 'asap' }).success).toBe(false);
  });

  it('accepts a ticket message and requires clientId-bearing parent ids', () => {
    const m = {
      id: id(1),
      ticketId: id(2),
      authorId: id(3),
      side: 'customer',
      body: 'Thanks',
      internal: false,
      attachmentIds: [],
      createdAt: at,
    };
    expect(ticketMessageSchema.safeParse(m).success).toBe(true);
    expect(ticketMessageSchema.safeParse({ ...m, side: 'robot' }).success).toBe(false);
    const { ticketId: _t, ...bad } = m;
    expect(ticketMessageSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts a faq vote keyed faqId:userId', () => {
    const v = { key: `${id(1)}:${id(2)}`, faqId: id(1), userId: id(2), helpful: true };
    expect(faqVoteSchema.safeParse(v).success).toBe(true);
    expect(faqVoteSchema.safeParse({ ...v, helpful: 'yes' }).success).toBe(false);
  });
});

describe('demoStateSchema.clientPersona (assumption 1)', () => {
  const state = { clockOffsetMs: 0, industry: 'nursery', persona: { side: 'staff', userId: id(1) } };

  it('is optional so stored states still parse', () => {
    expect(demoStateSchema.safeParse(state).success).toBe(true);
  });

  it('accepts a client persona with a user id and refuses one without', () => {
    expect(demoStateSchema.safeParse({ ...state, clientPersona: { userId: id(2) } }).success).toBe(true);
    expect(demoStateSchema.safeParse({ ...state, clientPersona: {} }).success).toBe(false);
  });
});
