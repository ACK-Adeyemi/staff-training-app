// M3 chunk 10b contract tests, part 2: exports, erase and retention (plan docs/plans/m3.md, assumptions 48, 49, 50,
// Data package `exports`, `people.erase`, `retention`, Contract tests "Exports and erase (BP-19)"). Runs against every
// adapter. Written before the implementation; the plan leaves these shapes open, so the implementer follows this.
//
// Exports (needs reports.export and the `exports` availability; the app zips what is returned)
//   - `exports.clientData(ctx, code)` and `exports.person(ctx, personId, code)`. `code` is the step-up code: the demo
//     code '123456'. A blank code is RuleError('stepUpRequired'), any other RuleError('wrongCode'). Staff, and client
//     admins without reports.export, get ForbiddenError('permission'). Deleted accounts get AccountStateError('exports');
//     every other account state (Read-only, Closed, Paused, Past due) exports normally.
//   - Both return an ExportBundle: the records in the actor's scope (whole client for an organisation-wide actor, own
//     sites for a site-scoped one; a person export is that one person's records). Never included: learner notes, `prefs`
//     on people, anything of another client, audit events. `modules` holds only modules the client owns.
//     `formerlyNote` is the domain `formerlyNote(client, ctx.now)` or null.
//   - `exports.person` for a person outside the actor's scope is ForbiddenError('outOfScope'); for another client's
//     person it is a ForbiddenError or NotFoundError.
//
// Erase
//   - `people.erase(ctx, personId, { mode, confirmName, code })` needs staff.delete in scope and step-up. `confirmName`
//     must equal "First Last" (trimmed, exact), else RuleError('invalidName'). The person record stays as a shell named
//     "Former staff member" plus a short id; nickname, prefs and the user account go, as do the person's notes.
//     'anonymise' keeps Evidence, attempts and learning events. 'deleteEverything' also removes the person's Evidence,
//     attempts, learning events and evidence submissions. The audit event ('people.erase', clientId, after.mode) holds
//     ids and the mode but never the name.
//
// Retention (assumption 50)
//   - `retention.schedule(ctx)` (settings.view) returns the domain `scheduledDeletions` for the client. `retention.update(ctx,
//     patch)` (settings.manage) merges the patch into settings.retention, returns the full policy, audits
//     'retention.update', and a value outside the bounds is a ValidationError that stores nothing.
import { describe, expect, it } from 'vitest';
import {
  createRng,
  fixedClock,
  type Assignment,
  type Attachment,
  type Attempt,
  type Client,
  type Evidence,
  type EvidenceSubmission,
  type LearningEvent,
  type Note,
  type Person,
  type UserAccount,
} from '@sta/domain';
import {
  AccountStateError,
  DataError,
  ForbiddenError,
  ValidationError,
  type ActorContext,
  type DemoAdmin,
  type StoreHandle,
  type StoreName,
  type StoreOptions,
} from '../types';
import { addLearningFixture, refusal, ruleOf } from './learning';
import { buildWorld, freshId, TODAY } from './world';

type ExportBundle = {
  exportedAt: string;
  people: Person[];
  evidence: Evidence[];
  assignments: Assignment[];
  attempts: Attempt[];
  sites: { id: string }[];
  teams: { id: string }[];
  modules: { id: string; owner: unknown }[];
  rules: { id: string }[];
  competitions: { id: string }[];
  formerlyNote: { old: string; changedAt: string } | null;
};
type Retention = Client['settings']['retention'];
type ScheduledDeletion = { category: string; subjectId?: string; at: string };
type ExportsStore = {
  exports: {
    clientData(ctx: ActorContext, code: string): Promise<ExportBundle>;
    person(ctx: ActorContext, personId: string, code: string): Promise<ExportBundle>;
  };
  people: {
    erase(
      ctx: ActorContext,
      personId: string,
      input: { mode: 'anonymise' | 'deleteEverything'; confirmName: string; code: string },
    ): Promise<void>;
  };
  retention: {
    schedule(ctx: ActorContext): Promise<ScheduledDeletion[]>;
    update(ctx: ActorContext, patch: Partial<Retention>): Promise<Retention>;
  };
};

const CODE = '123456';
const NOTE_TEXT = 'Private reflection about the fire drill, for me only';
const client = (userId: string, clientId: string): ActorContext => ({ userId, side: 'client', clientId, now: TODAY });
const staff = (userId: string, clientId: string): ActorContext => ({ userId, side: 'staff', clientId, now: TODAY });

async function dump<T>(admin: DemoAdmin, store: StoreName): Promise<T[]> {
  return ((await admin.dumpAll()) as Record<string, unknown[]>)[store] as T[];
}
const ids = (rows: { id: string }[]): string[] => rows.map((r) => r.id).sort();

export function runExportsRetentionContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup() {
    const options: StoreOptions = { clock: fixedClock(TODAY), rng: createRng(7) };
    const handle = await makeStore(options);
    const fx = await buildWorld(handle.admin);
    const lf = await addLearningFixture(handle.admin, fx);
    const admin = handle.admin;
    const store = handle.store as unknown as ExportsStore;
    const a = fx.ids.clients.a;
    const ot = fx.ids.clients.ot;
    const jade = fx.ids.people.jade;
    const hannah = fx.ids.people.hannah;

    // A learner note for Jade, a nickname, and a person who left.
    const note: Note = {
      id: freshId(8000),
      clientId: a,
      personId: jade,
      moduleId: lf.moduleId,
      body: NOTE_TEXT,
      starred: false,
      createdAt: '2026-10-10T09:00:00.000Z',
      updatedAt: '2026-10-10T09:00:00.000Z',
    };
    await admin.bulkPut('notes', [note]);
    const people = await dump<Person>(admin, 'people');
    const jadeRecord = people.find((p) => p.id === jade)!;
    await admin.bulkPut('people', [{ ...jadeRecord, nickname: 'Jadey' }]);
    const leaver: Person = {
      ...jadeRecord,
      id: freshId(8001),
      firstName: 'Lena',
      lastName: 'Leaver',
      status: 'archived',
      leftDate: '2026-01-15T09:00:00.000Z',
    };
    await admin.bulkPut('people', [leaver]);

    const actors = {
      priya: client(fx.ids.users.priya, a),
      daniel: client(fx.ids.users.daniel, a),
      rory: client(fx.ids.users.rory, a),
      jade: staff(fx.ids.users.jade, a),
      gina: client(fx.ids.users.gina, ot),
      tariq: client(fx.ids.users.riverMgr, ot),
      beth: client(fx.ids.users.beth, fx.ids.clients.b),
      roOwner: client(fx.ids.stateClients.readOnly.owner.id, fx.ids.clients.readOnly),
      closedOwner: client(fx.ids.stateClients.closed.owner.id, fx.ids.clients.closed),
      pausedOwner: client(fx.ids.stateClients.paused.owner.id, fx.ids.clients.paused),
      deletedOwner: client(fx.ids.stateClients.deleted.owner.id, fx.ids.clients.deleted),
    };
    return { ...fx, lf, admin, store, a, ot, jade, hannah, note, leaver, actors };
  }
  type S = Awaited<ReturnType<typeof setup>>;

  describe(`Exports, erase and retention contract: ${name}`, () => {
    describe('exports.clientData (BP-19, assumption 48)', () => {
      it('needs the step-up code: blank is stepUpRequired and a wrong code is wrongCode', async () => {
        const s: S = await setup();
        expect(await ruleOf(s.store.exports.clientData(s.actors.priya, ''))).toBe('stepUpRequired');
        expect(await ruleOf(s.store.exports.clientData(s.actors.priya, '000000'))).toBe('wrongCode');
      });

      it('returns every record of the client for an organisation-wide actor and nothing from another client', async () => {
        const s: S = await setup();
        const bundle = await s.store.exports.clientData(s.actors.priya, CODE);
        const mine = <T extends { clientId: string; id: string }>(rows: T[]) => rows.filter((r) => r.clientId === s.a);
        expect(ids(bundle.people)).toEqual(ids(mine(await dump<Person>(s.admin, 'people'))));
        expect(ids(bundle.evidence)).toEqual(ids(mine(await dump<Evidence>(s.admin, 'evidence'))));
        expect(ids(bundle.assignments)).toEqual(ids(mine(await dump<Assignment>(s.admin, 'assignments'))));
        expect(ids(bundle.attempts)).toEqual(ids(mine(await dump<Attempt>(s.admin, 'attempts'))));
        expect(bundle.people.every((p) => p.clientId === s.a)).toBe(true);
        expect(bundle.evidence.length).toBeGreaterThan(0);
        expect(bundle.exportedAt).toBe(TODAY);
      });

      it('holds only modules the client owns, not provider modules', async () => {
        const s: S = await setup();
        const bundle = await s.store.exports.clientData(s.actors.priya, CODE);
        expect(bundle.modules.every((m) => m.owner !== 'provider')).toBe(true);
        expect(bundle.modules.map((m) => m.id)).not.toContain(s.lf.moduleId);
      });

      it('leaves out learner notes and display prefs', async () => {
        const s: S = await setup();
        const bundle = await s.store.exports.clientData(s.actors.priya, CODE);
        const text = JSON.stringify(bundle);
        expect(text).not.toContain(NOTE_TEXT);
        expect(text).not.toContain(s.note.id);
        expect(Object.keys(bundle)).not.toContain('notes');
        expect(bundle.people.every((p) => (p as Partial<Person>).prefs === undefined)).toBe(true);
      });

      it('limits a site-scoped manager to their site: Tariq gets Riverside only', async () => {
        const s: S = await setup();
        const bundle = await s.store.exports.clientData(s.actors.tariq, CODE);
        expect(bundle.people.length).toBeGreaterThan(0);
        expect(bundle.people.every((p) => p.primarySiteId === s.ids.sites.river)).toBe(true);
        expect(bundle.people.map((p) => p.id)).not.toContain(s.ids.people.otHillside);
        expect(bundle.evidence.every((e) => e.siteIdAtTime === s.ids.sites.river)).toBe(true);
        expect(bundle.sites.map((x) => x.id)).toEqual([s.ids.sites.river]);
      });

      it('refuses actors without reports.export and staff with permission', async () => {
        const s: S = await setup();
        for (const ctx of [s.actors.daniel, s.actors.rory, s.actors.jade]) {
          const error = await refusal(s.store.exports.clientData(ctx, CODE));
          expect(error).toBeInstanceOf(ForbiddenError);
          expect((error as ForbiddenError).reason).toBe('permission');
        }
      });

      it('works in Read-only, Closed, Paused and Past due', async () => {
        const s: S = await setup();
        for (const ctx of [s.actors.roOwner, s.actors.closedOwner, s.actors.pausedOwner, s.actors.beth]) {
          const bundle = await s.store.exports.clientData(ctx, CODE);
          expect(bundle.people.every((p) => p.clientId === ctx.clientId)).toBe(true);
        }
      });

      it('refuses a Deleted account with AccountStateError exports', async () => {
        const s: S = await setup();
        const error = await refusal(s.store.exports.clientData(s.actors.deletedOwner, CODE));
        expect(error).toBeInstanceOf(AccountStateError);
        expect((error as AccountStateError).feature).toBe('exports');
      });

      it('adds the formerly note for 89 days after a name change and not at 91 days', async () => {
        const s: S = await setup();
        const oak = (await dump<Client>(s.admin, 'clients')).find((c) => c.id === s.ot)!;
        await s.admin.bulkPut('clients', [
          {
            ...oak,
            displayName: 'Oak Tree Nurseries',
            nameHistory: [
              {
                old: 'Oak Tree Nursery Group',
                new: 'Oak Tree Nurseries',
                changedBy: s.ids.users.gina,
                changedAt: '2026-07-22T09:00:00.000Z',
                reviewStatus: 'billingKept',
              },
            ],
          },
        ]);
        const at = (now: string): ActorContext => ({ ...s.actors.gina, now });
        const inside = await s.store.exports.clientData(at('2026-10-19T09:00:00.000Z'), CODE); // 89 days
        expect(inside.formerlyNote?.old).toBe('Oak Tree Nursery Group');
        const outside = await s.store.exports.clientData(at('2026-10-21T09:00:00.000Z'), CODE); // 91 days
        expect(outside.formerlyNote).toBeNull();
      });

      it('writes nothing except an audit event', async () => {
        const s: S = await setup();
        const before = await s.admin.dumpAll();
        await s.store.exports.clientData(s.actors.priya, CODE);
        const after = (await s.admin.dumpAll()) as Record<string, unknown[]>;
        for (const [store, rows] of Object.entries(before as Record<string, unknown[]>)) {
          if (store === 'audit') continue;
          expect(after[store], store).toEqual(rows);
        }
      });
    });

    describe('exports.person (BP-19, assumption 49)', () => {
      it('returns one person with only their own records and no notes', async () => {
        const s: S = await setup();
        const bundle = await s.store.exports.person(s.actors.priya, s.jade, CODE);
        expect(bundle.people.map((p) => p.id)).toEqual([s.jade]);
        expect(bundle.evidence.length).toBeGreaterThan(0);
        expect(bundle.evidence.every((e) => e.personId === s.jade)).toBe(true);
        expect(bundle.assignments.every((x) => x.personId === s.jade)).toBe(true);
        expect(bundle.attempts.map((x) => x.id)).toEqual([s.lf.jadeOldAttemptId]);
        expect(JSON.stringify(bundle)).not.toContain(NOTE_TEXT);
      });

      it('needs the step-up code', async () => {
        const s: S = await setup();
        expect(await ruleOf(s.store.exports.person(s.actors.priya, s.jade, ''))).toBe('stepUpRequired');
        expect(await ruleOf(s.store.exports.person(s.actors.priya, s.jade, '111111'))).toBe('wrongCode');
      });

      it('refuses a person outside a site-scoped actor scope with outOfScope, and allows one inside it', async () => {
        const s: S = await setup();
        const error = await refusal(s.store.exports.person(s.actors.tariq, s.ids.people.otHillside, CODE));
        expect(error).toBeInstanceOf(ForbiddenError);
        expect((error as ForbiddenError).reason).toBe('outOfScope');
        const ok = await s.store.exports.person(s.actors.tariq, s.ids.people.otRiver, CODE);
        expect(ok.people.map((p) => p.id)).toEqual([s.ids.people.otRiver]);
      });

      it('refuses another client person and refuses actors without reports.export', async () => {
        const s: S = await setup();
        expect(await refusal(s.store.exports.person(s.actors.priya, s.ids.people.otRiver, CODE))).toBeInstanceOf(
          DataError,
        );
        const error = await refusal(s.store.exports.person(s.actors.daniel, s.jade, CODE));
        expect((error as ForbiddenError).reason).toBe('permission');
      });
    });

    describe('people.erase (BP-19, assumption 49)', () => {
      const surname = async (s: S, id: string): Promise<string> =>
        (await dump<Person>(s.admin, 'people')).find((p) => p.id === id)!.lastName;

      it('needs the step-up code and the typed full name, and writes nothing when either is wrong', async () => {
        const s: S = await setup();
        const last = await surname(s, s.jade);
        const before = await s.admin.dumpAll();
        const base = { mode: 'anonymise', confirmName: `Jade ${last}`, code: CODE } as const;
        expect(await ruleOf(s.store.people.erase(s.actors.priya, s.jade, { ...base, code: '' }))).toBe(
          'stepUpRequired',
        );
        expect(await ruleOf(s.store.people.erase(s.actors.priya, s.jade, { ...base, code: '999999' }))).toBe(
          'wrongCode',
        );
        expect(await ruleOf(s.store.people.erase(s.actors.priya, s.jade, { ...base, confirmName: 'Jade' }))).toBe(
          'invalidName',
        );
        expect(await ruleOf(s.store.people.erase(s.actors.priya, s.jade, { ...base, confirmName: '' }))).toBe(
          'invalidName',
        );
        expect(await s.admin.dumpAll()).toEqual(before);
      });

      it('needs staff.delete in scope: Rory, Daniel, Tariq and staff are refused with permission', async () => {
        const s: S = await setup();
        const last = await surname(s, s.jade);
        for (const ctx of [s.actors.rory, s.actors.daniel, s.actors.jade]) {
          const error = await refusal(
            s.store.people.erase(ctx, s.jade, { mode: 'anonymise', confirmName: `Jade ${last}`, code: CODE }),
          );
          expect(error).toBeInstanceOf(ForbiddenError);
          expect((error as ForbiddenError).reason).toBe('permission');
        }
        const tariq = await refusal(
          s.store.people.erase(s.actors.tariq, s.ids.people.otRiver, {
            mode: 'anonymise',
            confirmName: 'Oscar Frost',
            code: CODE,
          }),
        );
        expect((tariq as ForbiddenError).reason).toBe('permission');
      });

      it('refuses another client person without changing anything', async () => {
        const s: S = await setup();
        const before = await s.admin.dumpAll();
        const error = await refusal(
          s.store.people.erase(s.actors.gina, s.jade, { mode: 'anonymise', confirmName: 'Jade Anyone', code: CODE }),
        );
        expect(error).toBeInstanceOf(DataError);
        expect(await s.admin.dumpAll()).toEqual(before);
      });

      it('anonymises: the name goes, notes and the user account go, Evidence attempts and events stay', async () => {
        const s: S = await setup();
        const last = await surname(s, s.jade);
        const evidenceBefore = (await dump<Evidence>(s.admin, 'evidence')).filter((e) => e.personId === s.jade);
        const attemptsBefore = (await dump<Attempt>(s.admin, 'attempts')).filter((x) => x.personId === s.jade);
        expect(evidenceBefore.length).toBeGreaterThan(0);
        await s.store.people.erase(s.actors.priya, s.jade, {
          mode: 'anonymise',
          confirmName: `Jade ${last}`,
          code: CODE,
        });

        const shell = (await dump<Person>(s.admin, 'people')).find((p) => p.id === s.jade)!;
        expect(`${shell.firstName} ${shell.lastName}`).toContain('Former staff member');
        expect(shell.firstName).not.toBe('Jade');
        expect(shell.lastName).not.toBe(last);
        expect((shell as Partial<Person>).nickname).toBeUndefined();
        expect((await dump<Note>(s.admin, 'notes')).filter((n) => n.personId === s.jade)).toEqual([]);
        expect((await dump<UserAccount>(s.admin, 'users')).map((u) => u.id)).not.toContain(s.ids.users.jade);
        expect((await dump<Evidence>(s.admin, 'evidence')).filter((e) => e.personId === s.jade)).toEqual(
          evidenceBefore,
        );
        expect((await dump<Attempt>(s.admin, 'attempts')).filter((x) => x.personId === s.jade)).toEqual(attemptsBefore);
      });

      it('anonymise removes a rejected certificate file and a file a resubmission replaced, and keeps the approved one', async () => {
        const s: S = await setup();
        const last = await surname(s, s.jade);
        const evidence = (await dump<Evidence>(s.admin, 'evidence')).find((e) => e.personId === s.jade)!;
        const file = (n: number): Attachment => ({
          id: freshId(8100 + n),
          clientId: s.a,
          kind: 'file',
          purpose: 'certificate',
          title: `Certificate ${n}`,
          mime: 'application/pdf',
          bytes: 5,
          data: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
          ownerUserId: s.ids.users.jade,
          personId: s.jade,
          redacted: false,
          createdAt: '2026-10-01T09:00:00.000Z',
        });
        const [approvedFile, rejectedFile, replacedFile] = [file(1), file(2), file(3)] as [
          Attachment,
          Attachment,
          Attachment,
        ];
        const submission = (n: number, fileId: string, status: EvidenceSubmission['status']): EvidenceSubmission => ({
          id: freshId(8200 + n),
          clientId: s.a,
          siteId: evidence.siteIdAtTime,
          personId: s.jade,
          requirementId: evidence.requirementId,
          uploadedBy: s.ids.users.jade,
          fileAttachmentId: fileId,
          providerName: 'Sample Training',
          completedAt: '2026-09-01T09:00:00.000Z',
          status,
          createdAt: '2026-10-01T09:00:00.000Z',
          ...(status === 'rejected' ? { reviewedAt: '2026-10-05T09:00:00.000Z' } : {}),
        });
        await s.admin.bulkPut('attachments', [approvedFile, rejectedFile, replacedFile]);
        await s.admin.bulkPut('evidenceSubmissions', [
          submission(1, approvedFile.id, 'approved'),
          submission(2, rejectedFile.id, 'rejected'),
        ]);
        await s.store.people.erase(s.actors.priya, s.jade, {
          mode: 'anonymise',
          confirmName: `Jade ${last}`,
          code: CODE,
        });
        const left = (await dump<Attachment>(s.admin, 'attachments')).map((a) => a.id);
        expect(left).toContain(approvedFile.id);
        expect(left).not.toContain(rejectedFile.id);
        expect(left).not.toContain(replacedFile.id);
      });

      it('leaves other people and other clients untouched', async () => {
        const s: S = await setup();
        const last = await surname(s, s.jade);
        const before = (await dump<Person>(s.admin, 'people')).filter((p) => p.id !== s.jade);
        await s.store.people.erase(s.actors.priya, s.jade, {
          mode: 'anonymise',
          confirmName: `Jade ${last}`,
          code: CODE,
        });
        const after = (await dump<Person>(s.admin, 'people')).filter((p) => p.id !== s.jade);
        expect(after).toEqual(before);
        expect((await dump<Note>(s.admin, 'notes')).map((n) => n.id)).toEqual([]);
      });

      it('delete everything also removes Evidence, attempts, learning events and submissions', async () => {
        const s: S = await setup();
        const last = await surname(s, s.hannah);
        const jadeEvidence = (await dump<Evidence>(s.admin, 'evidence')).filter((e) => e.personId === s.jade);
        await s.store.people.erase(s.actors.priya, s.hannah, {
          mode: 'deleteEverything',
          confirmName: `Hannah ${last}`,
          code: CODE,
        });
        const gone = (rows: { personId: string }[]) => rows.filter((r) => r.personId === s.hannah);
        expect(gone(await dump<Evidence>(s.admin, 'evidence'))).toEqual([]);
        expect(gone(await dump<Attempt>(s.admin, 'attempts'))).toEqual([]);
        expect(gone(await dump<LearningEvent>(s.admin, 'learningEvents'))).toEqual([]);
        expect(gone(await dump<{ personId: string }>(s.admin, 'evidenceSubmissions'))).toEqual([]);
        // Someone else's records are not touched, and the shell person has no name left.
        expect((await dump<Evidence>(s.admin, 'evidence')).filter((e) => e.personId === s.jade)).toEqual(jadeEvidence);
        const shell = (await dump<Person>(s.admin, 'people')).find((p) => p.id === s.hannah)!;
        expect(shell.firstName).not.toBe('Hannah');
        expect((await dump<UserAccount>(s.admin, 'users')).map((u) => u.id)).not.toContain(s.keys.users['hannah']);
      });

      it('refuses to erase a person who has an admin login: access is revoked first (self, last owner, others)', async () => {
        const s: S = await setup();
        const users = await dump<UserAccount>(s.admin, 'users');
        const before = await s.admin.dumpAll();
        for (const [actor, userId] of [
          [s.actors.priya, s.ids.users.priya],
          [s.actors.priya, s.ids.users.daniel],
          [s.actors.rory, s.ids.users.priya],
        ] as const) {
          const target = users.find((u) => u.id === userId)!;
          const person = (await dump<Person>(s.admin, 'people')).find((p) => p.id === target.personId)!;
          const error = await refusal(
            s.store.people.erase(actor, person.id, {
              mode: 'anonymise',
              confirmName: `${person.firstName} ${person.lastName}`,
              code: CODE,
            }),
          );
          expect(error).toBeInstanceOf(Error);
        }
        const priyaPerson = users.find((u) => u.id === s.ids.users.priya)!.personId!;
        const p = (await dump<Person>(s.admin, 'people')).find((x) => x.id === priyaPerson)!;
        expect(
          await ruleOf(
            s.store.people.erase(s.actors.priya, priyaPerson, {
              mode: 'deleteEverything',
              confirmName: `${p.firstName} ${p.lastName}`,
              code: CODE,
            }),
          ),
        ).toBe('revokeAccessFirst');
        expect((await dump<UserAccount>(s.admin, 'users')).map((u) => u.id)).toContain(s.ids.users.priya);
        expect(await s.admin.dumpAll()).toEqual(before);
      });

      it('audits the erase with the mode and without the name', async () => {
        const s: S = await setup();
        const last = await surname(s, s.jade);
        await s.store.people.erase(s.actors.priya, s.jade, {
          mode: 'anonymise',
          confirmName: `Jade ${last}`,
          code: CODE,
        });
        const events = (await dump<{ action: string; clientId?: string }>(s.admin, 'audit')).filter(
          (e) => e.action === 'people.erase',
        );
        expect(events).toHaveLength(1);
        expect(events[0]!.clientId).toBe(s.a);
        const text = JSON.stringify(events);
        expect(text).toContain('anonymise');
        expect(text).not.toContain('Jade');
        expect(text).not.toContain(last);
      });
    });

    describe('retention (BP-19, assumption 50)', () => {
      it('lists leaver deletion dates from the left date and the policy', async () => {
        const s: S = await setup();
        const schedule = await s.store.retention.schedule(s.actors.priya);
        const records = schedule.find((d) => d.category === 'leaverRecords' && d.subjectId === s.leaver.id);
        const notes = schedule.find((d) => d.category === 'leaverNotes' && d.subjectId === s.leaver.id);
        expect(records?.at.slice(0, 10)).toBe('2032-01-15'); // 72 months
        expect(notes?.at.slice(0, 10)).toBe('2026-02-14'); // 30 days
        const times = schedule.map((d) => Date.parse(d.at));
        expect(times).toEqual([...times].sort((x, y) => x - y));
      });

      it('lists the deletion date of a Closed account, and none for an account that is not Closed', async () => {
        const s: S = await setup();
        const closed = await s.store.retention.schedule(s.actors.closedOwner);
        const account = closed.filter((d) => d.category === 'account');
        expect(account).toHaveLength(1);
        expect(Date.parse(account[0]!.at)).toBeGreaterThan(Date.parse(TODAY));
        const active = await s.store.retention.schedule(s.actors.priya);
        expect(active.some((d) => d.category === 'account')).toBe(false);
      });

      it('updates the policy, moves the dates and audits it', async () => {
        const s: S = await setup();
        const saved = await s.store.retention.update(s.actors.priya, {
          leaverRecordsMonths: 24,
          notesAfterLeaveDays: 90,
        });
        expect(saved).toMatchObject({ leaverRecordsMonths: 24, notesAfterLeaveDays: 90, eventDetailMonths: 24 });
        const c = (await dump<Client>(s.admin, 'clients')).find((x) => x.id === s.a)!;
        expect(c.settings.retention.leaverRecordsMonths).toBe(24);
        const schedule = await s.store.retention.schedule(s.actors.priya);
        expect(
          schedule.find((d) => d.category === 'leaverRecords' && d.subjectId === s.leaver.id)?.at.slice(0, 10),
        ).toBe('2028-01-15');
        expect(schedule.find((d) => d.category === 'leaverNotes' && d.subjectId === s.leaver.id)?.at.slice(0, 10)).toBe(
          '2026-04-15',
        );
        const audit = await dump<{ action: string; clientId?: string }>(s.admin, 'audit');
        expect(audit.some((e) => e.action === 'retention.update' && e.clientId === s.a)).toBe(true);
      });

      it.each([
        { leaverRecordsMonths: 11 },
        { leaverRecordsMonths: 121 },
        { notesAfterLeaveDays: 29 },
        { notesAfterLeaveDays: 366 },
        { eventDetailMonths: 12 },
        { eventDetailMonths: 61 },
        { feedbackMonths: 11 },
        { feedbackMonths: 61 },
      ])('refuses %j as outside the bounds and stores nothing', async (patch) => {
        const s: S = await setup();
        const before = await s.admin.dumpAll();
        expect(await refusal(s.store.retention.update(s.actors.priya, patch))).toBeInstanceOf(ValidationError);
        expect(await s.admin.dumpAll()).toEqual(before);
      });

      it('accepts the bounds themselves', async () => {
        const s: S = await setup();
        const low = await s.store.retention.update(s.actors.priya, {
          leaverRecordsMonths: 12,
          notesAfterLeaveDays: 30,
          eventDetailMonths: 13,
          feedbackMonths: 12,
        });
        expect(low.leaverRecordsMonths).toBe(12);
        const high = await s.store.retention.update(s.actors.priya, {
          leaverRecordsMonths: 120,
          notesAfterLeaveDays: 365,
          eventDetailMonths: 60,
          feedbackMonths: 60,
        });
        expect(high.feedbackMonths).toBe(60);
      });

      it('needs settings.manage to change and settings.view to read: Daniel and staff are refused', async () => {
        const s: S = await setup();
        for (const ctx of [s.actors.daniel, s.actors.jade]) {
          expect(await refusal(s.store.retention.update(ctx, { leaverRecordsMonths: 24 }))).toBeInstanceOf(
            ForbiddenError,
          );
          expect(await refusal(s.store.retention.schedule(ctx))).toBeInstanceOf(ForbiddenError);
        }
      });

      it('shows only this client and deletes nothing', async () => {
        const s: S = await setup();
        const before = await s.admin.dumpAll();
        const schedule = await s.store.retention.schedule(s.actors.gina);
        expect(schedule.every((d) => d.subjectId !== s.leaver.id)).toBe(true);
        const after = (await s.admin.dumpAll()) as Record<string, unknown[]>;
        for (const [store, rows] of Object.entries(before as Record<string, unknown[]>))
          expect(after[store], store).toEqual(rows);
      });
    });
  });
}
