// M4 seed (plan docs/plans/m4.md chunk 1; build pack 7.1, 7.2, 7.4). One forked stream `m4`, drawn after every earlier
// stream so no earlier record moves. Everything is fictional. Nothing here reads the real time or makes a request.
import {
  addDays,
  clientRoleTemplates,
  compileClientRole,
  ticketNumber,
  ulid,
  type BillingProfile,
  type Clock,
  type LearnMoreLink,
  type LearningEvent,
  type Module,
  type OtherEntryGroup,
  type Rng,
  type Role,
  type Ticket,
} from '@sta/domain';
import type { SeedData, SeedKeys } from './world';

const need = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error('Seed: a record the M4 data refers to is missing');
  return value;
};
const HOUR = 3_600_000;
const MINUTE = 60_000;

type Input = { data: SeedData; keys: SeedKeys; today: Date; clock: Clock; rng: Rng };

export function buildM4({ data, keys, today, clock, rng }: Input): void {
  const iso = (d: Date): string => d.toISOString();
  const ago = (days: number, minutes = 0): string => iso(new Date(addDays(today, -days).getTime() + minutes * MINUTE));
  const ahead = (days: number): string => iso(addDays(today, days));
  const newId = (): string => ulid(clock, rng);
  const client = (key: string): string => need(keys.clients[key]);
  const user = (key: string): string => need(keys.users[key]);
  const owner = user('providerOwner');
  const raj = user('raj');
  const sophie = user('sophie');

  // --- A Harbour Cafe Group owner, so its billing change request has a real requester (summary clients have no staff).
  const harbour = client('harbourCafe');
  const harbourOwner = newId();
  keys.users['harbourOwner'] = harbourOwner;
  data.users.push({
    id: harbourOwner,
    side: 'client',
    clientId: harbour,
    email: 'nadia.rahman@harbour-cafe-group.test',
    displayName: 'Nadia Rahman',
    status: 'active',
    login: { method: 'emailPassword', pinSet: false },
    twoFactorRequiredSince: ago(60),
    lastActiveAt: ago(3),
  });
  const ownerTemplate = need(clientRoleTemplates.find((t) => t.key === 'accountOwner'));
  const ownerRole: Role = {
    id: newId(),
    owner: { clientId: harbour },
    name: ownerTemplate.name,
    description: `${ownerTemplate.name} role`,
    colour: '#4a4a4a',
    permissionIds: compileClientRole(ownerTemplate.levels, ownerTemplate.allows),
    system: true,
    systemKey: ownerTemplate.key,
    version: 1,
    clientLevels: ownerTemplate.levels,
    clientAllows: ownerTemplate.allows,
    updatedBy: harbourOwner,
    updatedAt: ago(100),
  };
  keys.roles['harbourCafe.accountOwner'] = ownerRole.id;
  data.roles.push(ownerRole);
  data.roleAssignments.push({
    id: newId(),
    userId: harbourOwner,
    roleIds: [ownerRole.id],
    scope: { type: 'clients', ids: [harbour] },
    grants: [],
    denies: [],
    status: 'active',
  });

  // --- Billing profiles for the two summary clients the price and billing seeds name.
  const brookfield = client('brookfield');
  const oak = client('oakTree');
  const profiles: [string, string, string, string][] = [
    [brookfield, 'Brookfield Primary School', 'Brookfield Lane, Anytown AB7 8IJ', raj],
    [harbour, 'Harbour Cafe Group', '14 Quay Street, Anytown AB9 1KL', harbourOwner],
  ];
  for (const [clientId, name, address, updatedBy] of profiles) {
    const sub = need(data.subscriptions.find((s) => s.clientId === clientId));
    const profile: BillingProfile = {
      clientId,
      billingName: name,
      address,
      billingContactEmail: sub.billingContact,
      paymentMethod: { brand: 'Visa', last4: String(rng.int(1000, 9999)), expMonth: rng.int(1, 12), expYear: 2028 },
      updatedBy,
      updatedAt: ago(150),
    };
    data.billingProfiles.push(profile);
  }

  // --- Price changes (7.4): an ongoing loyalty discount, a confirmed increase in 18 days, and one draft.
  data.priceAdjustments.push(
    {
      id: newId(),
      clientIds: [oak],
      scope: { kind: 'plan' },
      type: 'percent',
      value: -10,
      reason: 'loyalty',
      note: 'Multi-site loyalty discount',
      noticeDays: 30,
      effectiveAt: ago(90),
      status: 'active',
      createdBy: raj,
      confirmedBy: owner,
      confirmedAt: ago(125),
    },
    {
      id: newId(),
      clientIds: [brookfield],
      scope: { kind: 'plan' },
      type: 'percent',
      value: 5,
      reason: 'annualReview',
      note: 'Annual price review',
      noticeDays: 30,
      effectiveAt: ahead(18),
      status: 'scheduled',
      createdBy: raj,
      confirmedBy: owner,
      confirmedAt: ago(12),
    },
    {
      id: newId(),
      clientIds: [client('summitBuilders')],
      scope: { kind: 'plan' },
      type: 'percent',
      value: -15,
      reason: 'retention',
      note: 'Low usage: offer a lower price to keep them',
      noticeDays: 30,
      status: 'draft',
      createdBy: raj,
    },
  );
  const brookfieldProfile = need(data.billingProfiles.find((p) => p.clientId === brookfield));
  data.outbox.push({
    id: newId(),
    channel: 'email',
    to: brookfieldProfile.billingContactEmail,
    subject: `Your plan price changes on ${ahead(18).slice(0, 10)}`,
    body: `Hello. After our annual review, the price of your plan goes up by 5% from ${ahead(18).slice(0, 10)}. You do not need to do anything. Invoices already issued do not change.`,
    at: ago(12),
    reason: 'Price change notice (annual review)',
  });

  // --- Profile and billing changes (7.4).
  data.profileChangeRequests.push({
    id: newId(),
    clientId: oak,
    kind: 'nameChange',
    oldName: 'Oak Tree Nurseries',
    newName: 'Oak Tree Nurseries Group',
    requestedBy: user('oakTreeGroupAdmin'),
    status: 'pendingReview',
    createdAt: ago(2),
  });
  data.billingChangeRequests.push({
    id: newId(),
    clientId: harbour,
    requestedBy: harbourOwner,
    proposed: { address: '3 Marina Court, Anytown AB9 2MN' },
    status: 'pending',
    reason: 'We have moved our head office.',
    createdAt: ago(1),
  });

  // --- Learn more: a simulated check result for every provider link with a web address, one of them broken, plus
  // seeded opens in two clients (no open-count event type: opens are ordinary learnMoreOpened events with a linkId).
  type Found = { module: Module; questionId: string; link: LearnMoreLink & { url: string } };
  const found: Found[] = [];
  const seen = new Set<string>();
  for (const m of data.modules.filter((x) => x.owner === 'provider')) {
    for (const q of m.questions) {
      for (const l of q.learnMore) {
        if (l.url === undefined || seen.has(`${m.id}/${l.id}`)) continue;
        seen.add(`${m.id}/${l.id}`);
        found.push({ module: m, questionId: q.id, link: { ...l, url: l.url } });
      }
    }
  }
  if (found.length < 6) throw new Error('Seed: not enough provider links for the link check');
  const brokenIndex = 2;
  found.slice(0, 12).forEach((f, i) => {
    data.linkCheckResults.push({
      id: newId(),
      linkId: f.link.id,
      moduleId: f.module.id,
      url: f.link.url,
      status: i === brokenIndex ? 'broken' : 'ok',
      checkedAt: ago(1, -180),
    });
  });
  // Little Acorns already has opens from its own history (M2), which must not move; the extra opens are Oak Tree's.
  const oakPeople = data.people.filter((p) => p.clientId === oak && p.status === 'active').slice(0, 4);
  const opens: LearningEvent[] = [];
  const checked = found.slice(0, 12);
  checked.forEach((f, i) => {
    const count = i === brokenIndex ? 3 : 1 + (i % 3);
    for (let k = 0; k < count; k++) {
      const p = need(oakPeople[(i + k) % oakPeople.length]);
      opens.push({
        id: newId(),
        clientId: p.clientId,
        siteId: p.primarySiteId,
        personId: p.id,
        at: ago(1 + ((i * 3 + k * 5) % 25), 14 * 60 + k),
        type: 'learnMoreOpened',
        moduleId: f.module.id,
        moduleVersion: f.module.version,
        questionId: f.questionId,
        linkId: f.link.id,
      });
    }
  });
  data.learningEvents.push(...opens);

  // --- Tickets with "Other" phrases, and the groups the provider review builds from them.
  /** A small fictional screenshot (a plain PNG, no real content). */
  const screenshotBytes = (): Uint8Array<ArrayBuffer> => {
    const raw = atob(
      'iVBORw0KGgoAAAANSUhEUgAAAGAAAAAwCAIAAABhdOiYAAAAcklEQVR42u3YMQ0AIAwEQJSgBE0YxwETBmhnQq/58aebPm19TEnSEAACBAgQIECAAMkVaAW3g6vWBwQIECBALwOByPuAAAECBAgQoH+BQFjSgAABAgQIkH+QoWhJAwIECBAgQP5BhqIlDQgQIECAABXoH4DIb2aup77rAAAAAElFTkSuQmCC',
    );
    const out = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out;
  };
  const userOf = (key: string) => need(data.users.find((u) => u.id === user(key)));
  let sequence = Math.max(0, ...data.tickets.map((t) => Number(t.number.replace('T-', '')) - 1000));
  type Spec = {
    by: string;
    days: number;
    title: string;
    description: string;
    feature?: string;
    featureOther?: string;
    issueType?: string;
    issueTypeOther?: string;
    status: Ticket['status'];
    /** Adds a fictional screenshot to the first message (alt text). */
    screenshot?: string;
  };
  const makeTickets = (specs: Spec[]): Ticket[] =>
    specs.map((s) => {
      const u = userOf(s.by);
      const person = data.people.find((p) => p.id === u.personId);
      const created = ago(s.days, 9 * 60);
      const id = newId();
      sequence += 1;
      const ticket: Ticket = {
        id,
        number: ticketNumber(sequence),
        clientId: need(u.clientId),
        ...(person ? { siteId: person.primarySiteId } : {}),
        raisedBy: u.id,
        raiserSide: u.side === 'staff' ? 'staff' : 'client',
        sharedWithManager: false,
        ...(s.feature ? { featureId: s.feature } : {}),
        ...(s.featureOther ? { featureOtherText: s.featureOther } : {}),
        ...(s.issueType ? { issueTypeId: s.issueType } : {}),
        ...(s.issueTypeOther ? { issueTypeOtherText: s.issueTypeOther } : {}),
        title: s.title,
        description: s.description,
        impact: 'workaround',
        priority: 'normal',
        status: s.status,
        tags: [],
        context: { screen: u.side === 'staff' ? 'S1' : 'C5' },
        linkedErrorIds: [],
        createdAt: created,
        updatedAt: created,
      };
      data.tickets.push(ticket);
      const screenshotIds: string[] = [];
      if (s.screenshot) {
        const bytes = screenshotBytes();
        const fileId = newId();
        screenshotIds.push(fileId);
        data.attachments.push({
          id: fileId,
          clientId: ticket.clientId,
          kind: 'file',
          purpose: 'ticketScreenshot',
          title: 'Screenshot of the progress bar',
          mime: 'image/png',
          bytes: bytes.length,
          data: bytes,
          ownerUserId: u.id,
          redacted: false,
          alt: s.screenshot,
          createdAt: created,
        });
      }
      data.ticketMessages.push({
        id: newId(),
        ticketId: id,
        authorId: u.id,
        side: 'customer',
        body: s.description,
        internal: false,
        attachmentIds: screenshotIds,
        createdAt: created,
      });
      return ticket;
    });
  const group = (
    field: OtherEntryGroup['field'],
    normalised: string,
    tickets: Ticket[],
    examples: string[],
  ): OtherEntryGroup => {
    const times = tickets.map((t) => t.createdAt).sort();
    return {
      id: newId(),
      field,
      normalised,
      examples,
      ticketIds: tickets.map((t) => t.id),
      count: tickets.length,
      firstSeen: need(times[0]),
      lastSeen: need(times.at(-1)),
      review: 'unreviewed',
    };
  };

  const cert = makeTickets(
    [
      ['oakTreeGroupAdmin', 27, "Certificate won't download", 'inProgress'],
      ['riversideManager', 21, 'Cert wont download', 'received'],
      ['meadowManager', 14, "Certificate won't download on my phone", 'received'],
      ['hillsideManager', 8, "Certificate won't download", 'waitingForCustomer'],
      ['willowLaneOwner', 3, 'Certificate wont download', 'received'],
    ].map(([by, days, text, status]) => ({
      by: by as string,
      days: days as number,
      title: 'Cannot download a training certificate',
      description: `I press Download and nothing happens. I tried more than once.`,
      feature: 'reports',
      issueTypeOther: text as string,
      status: status as Ticket['status'],
    })),
  );
  const rota = makeTickets(
    [
      ['riversideManager', 25, 'Staff rota'],
      ['hillsideManager', 17, 'staff rota'],
      ['oakTreeGroupAdmin', 9, 'Staff rota planner'],
      ['willowLaneOwner', 5, 'staff rota'],
    ].map(([by, days, text]) => ({
      by: by as string,
      days: days as number,
      title: 'Can the app show our staff rota?',
      description: 'It would help to see who is in each day next to their training.',
      featureOther: text as string,
      issueType: 'howTo',
      status: 'received' as const,
    })),
  );
  const oneFeature = makeTickets([
    {
      by: 'meadowManager',
      days: 11,
      title: 'Can we send a newsletter to parents?',
      description: 'We would like to share news with parents from here.',
      featureOther: 'Parent newsletter',
      issueType: 'howTo',
      status: 'received',
    },
  ]);
  const oneIssue = makeTickets([
    {
      by: 'willowLaneOwner',
      days: 6,
      title: 'The progress bar is hard to see at night',
      description: 'In dark mode the progress bar blends into the background.',
      feature: 'notes',
      issueTypeOther: 'Progress bar too faint',
      status: 'received',
      screenshot: 'Screenshot of a training progress bar that is hard to see against a dark background',
    },
  ]);
  data.otherEntryGroups.push(
    group('issueType', "certificate won't download", cert, [
      "Certificate won't download",
      'Cert wont download',
      "Certificate won't download on my phone",
      'Certificate wont download',
    ]),
    group('feature', 'staff rota', rota, ['Staff rota', 'staff rota', 'Staff rota planner']),
    group('feature', 'parent newsletter', oneFeature, ['Parent newsletter']),
    group('issueType', 'progress bar too faint', oneIssue, ['Progress bar too faint']),
  );

  // --- Saved replies (5).
  const replies: [string, string][] = [
    [
      'Thanks, we are looking',
      'Hi {{firstName}}, thanks for telling us. We are looking into it and will update you here.',
    ],
    [
      'Need a little more detail',
      'Hi {{firstName}}, could you tell us which screen you were on and what you pressed? That helps us find it quickly.',
    ],
    [
      'Fixed, please try again',
      'Hi {{firstName}}, we have fixed this. Please refresh the app and try again, and tell us if it still happens.',
    ],
    [
      'How to find it',
      'You can find this under Help in the menu. If it is not there, reply and we will walk you through it.',
    ],
    [
      'Passing to the right team',
      'Thanks. We have passed this to the team that looks after it. You do not need to do anything else.',
    ],
  ];
  for (const [title, body] of replies) data.savedReplies.push({ id: newId(), title, body });

  // --- Comms: 2 announcements (one live banner), 3 release notes, 1 open recovery request, 2 data requests, status Normal.
  data.announcements.push(
    {
      id: newId(),
      title: 'New module: Fire evacuation template',
      body: 'A new Fire evacuation module is ready to assign from the content library.',
      link: '#/client/modules',
      audience: { sides: ['staff', 'client'] },
      channels: ['banner', 'notification'],
      publishAt: ago(2),
      expiresAt: ahead(5),
      createdBy: owner,
      reads: 14,
    },
    {
      id: newId(),
      title: 'Planned maintenance on Sunday morning',
      body: 'The app may be slow for about 20 minutes. Nothing will be lost.',
      audience: { sides: ['client'] },
      channels: ['banner', 'email'],
      publishAt: ago(20),
      expiresAt: ago(13),
      createdBy: owner,
      reads: 37,
    },
  );
  const providerModule = need(data.modules.find((m) => m.owner === 'provider'));
  const doneFeedback = data.appFeedback.filter((f) => f.status === 'done' || f.status === 'planned').map((f) => f.id);
  const notes: [string, string, number, string[]][] = [
    ['What changed in August 2026', 'Clearer lesson headings and faster loading on phones.', 62, []],
    ['What changed in September 2026', 'Reminders the day before a quiz is due.', 33, doneFeedback.slice(0, 1)],
    [
      'What changed in October 2026',
      'Compare your sites on one page, and a new Fire evacuation module.',
      5,
      doneFeedback.slice(1, 2),
    ],
  ];
  for (const [title, body, days, feedbackIds] of notes) {
    data.releaseNotes.push({
      id: newId(),
      title,
      body,
      date: ago(days),
      feedbackIds,
      moduleVersions: days === 5 ? [{ moduleId: providerModule.id, version: providerModule.version }] : [],
    });
  }
  data.recoveryRequests.push({
    id: newId(),
    clientId: oak,
    subjectUserId: user('oakTreeGroupAdmin'),
    requester: 'Group admin, by phone',
    reason: 'Lost phone and cannot use the sign-in code',
    checks: [{ key: 'callBack', doneBy: sophie, at: ago(1, 2 * 60) }],
    approvals: [sophie],
    status: 'open',
  });
  data.dataRequests.push(
    {
      id: newId(),
      clientId: client('littleAcorns'),
      kind: 'access',
      requester: 'A former member of staff',
      receivedAt: ago(24),
      dueAt: ahead(6),
      status: 'open',
      notes: 'Identity checked by phone. Export being prepared.',
    },
    {
      id: newId(),
      kind: 'correction',
      requester: 'A parent who contacted the provider',
      receivedAt: ago(40),
      dueAt: ago(10),
      status: 'done',
      notes: 'Spelling of a name corrected and confirmed in writing.',
    },
  );
  data.incidents.push({
    id: newId(),
    level: 'degraded',
    title: 'Slow certificate downloads',
    updates: [
      { status: 'investigating', message: 'Some certificate downloads are slow. We are looking into it.', at: ago(12) },
      { status: 'identified', message: 'We found the cause and are fixing it.', at: ago(12, 90) },
      { status: 'resolved', message: 'Downloads are back to normal.', at: ago(12, (3 * HOUR) / MINUTE) },
    ],
    startedAt: ago(12),
    resolvedAt: ago(12, (3 * HOUR) / MINUTE),
  });
}
