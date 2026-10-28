// Ownership transfer (M4 chunk 5a, plan "Ownership transfer"). The Account Owner (client side) or the provider
// Owner (provider side) hands the owner role to another active user: request, receiver accepts, current owner
// confirms with the demo code, then complete after the 7 day cooling-off. Each write authorises, applies the domain
// rules (@sta/domain ownership) and writes in ONE batch together with its audit event. The two sides never cross.
import {
  acceptTransfer,
  cancelTransfer,
  completeTransfer,
  confirmTransferTwoFactor,
  demoTwoFactorCode,
  fixedClock,
  lastOwnerGuard,
  OWNER_KEYS,
  ownershipTransferSchema,
  requestTransfer,
  type OwnershipResult,
  type OwnershipTransfer,
  type Role,
  type RoleAssignment,
  type UserAccount,
} from '@sta/domain';
import type { RawBackend, WriteOp } from './backend';
import { audit, beginCall, forbid, type Call } from './policy';
import {
  NotFoundError,
  RuleError,
  ValidationError,
  type ActorContext,
  type OwnershipRequestInput,
  type OwnershipService,
  type StoreOptions,
} from './types';

const put = (store: WriteOp['store'], key: string, record: unknown): WriteOp => ({ type: 'put', store, key, record });
const isOwnerKey = (r: Role): boolean => r.systemKey === OWNER_KEYS.provider || r.systemKey === OWNER_KEYS.client;
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

export function createOwnershipOperations(backend: RawBackend, options: StoreOptions): OwnershipService {
  const all = (call: Call) => call.all<OwnershipTransfer>('ownershipTransfers');
  const clockOf = (call: Call) => fixedClock(call.actor.ctx.now);

  /** Owner system roles for one side (never recognised by name). */
  async function ownerRoleIds(call: Call, side: 'client' | 'provider', clientId?: string): Promise<Set<string>> {
    const roles = await call.all<Role>('roles');
    return new Set(
      roles
        .filter((r) =>
          side === 'provider'
            ? r.system && r.owner === 'provider' && r.systemKey === OWNER_KEYS.provider
            : r.system && r.owner !== 'provider' && r.owner.clientId === clientId && r.systemKey === OWNER_KEYS.client,
        )
        .map((r) => r.id),
    );
  }

  const sameSide = (call: Call, t: { side: 'client' | 'provider'; clientId?: string | undefined }): boolean =>
    t.side === 'provider' ? call.side === 'provider' : call.side === 'client' && t.clientId === call.clientId;

  /** Loads a transfer the actor's side may touch; anything else is forbidden (fail closed). */
  async function load(call: Call, id: string): Promise<OwnershipTransfer> {
    const found = (await all(call)).find((t) => t.id === text(id));
    if (!found) throw new NotFoundError();
    if (!sameSide(call, found)) return forbid('tenant');
    return found;
  }

  const involved = (call: Call, t: OwnershipTransfer): boolean =>
    t.fromUserId === call.actor.user.id || t.toUserId === call.actor.user.id;

  function must(result: OwnershipResult): OwnershipTransfer {
    if (!result.ok) throw new RuleError('notApplicable');
    return result.transfer;
  }

  const clientOf = (t: OwnershipTransfer) => (t.side === 'client' ? t.clientId : undefined);

  async function step(call: Call, id: string, action: string, fn: (t: OwnershipTransfer) => OwnershipResult) {
    const before = await load(call, id);
    const next = must(fn(before));
    await backend.apply([
      put('ownershipTransfers', next.id, next),
      audit(call, clientOf(next), action, next.id, { status: before.status }, { status: next.status }),
    ]);
    return structuredClone(next);
  }

  return {
    async request(ctx: ActorContext, input: OwnershipRequestInput) {
      const call = await beginCall(backend, options, ctx);
      const i = (input as Partial<OwnershipRequestInput> | null) ?? {};
      if (i.side !== 'client' && i.side !== 'provider') throw new ValidationError(['side: client or provider']);
      const clientId = i.side === 'client' ? call.clientId : undefined;
      if (!sameSide(call, { side: i.side, clientId: i.clientId })) return forbid('tenant');
      const owners = await ownerRoleIds(call, i.side, clientId);
      const mine = (await call.all<RoleAssignment>('roleAssignments')).filter(
        (a) => a.userId === call.actor.user.id && a.status === 'active' && a.roleIds.some((r) => owners.has(r)),
      );
      if (mine.length === 0) return forbid('permission');

      const to = (await call.all<UserAccount>('users')).find((u) => u.id === text(i.toUserId));
      if (!to || to.status !== 'active' || to.side !== call.side || to.clientId !== call.clientId) {
        throw new ValidationError(['toUserId: choose an active person on the same side']);
      }
      const demote = (await call.all<Role>('roles')).find((r) => r.id === text(i.demoteFromTo));
      const ownRole =
        demote !== undefined &&
        (i.side === 'provider'
          ? demote.owner === 'provider'
          : demote.owner !== 'provider' && demote.owner.clientId === clientId);
      if (!demote || !ownRole || owners.has(demote.id) || isOwnerKey(demote)) {
        throw new ValidationError(['demoteFromTo: choose a role other than the owner role']);
      }
      const t = requestTransfer(
        {
          id: call.newId(),
          side: i.side,
          clientId,
          fromUserId: call.actor.user.id,
          toUserId: to.id,
          demoteFromTo: demote.id,
        },
        clockOf(call),
      );
      const parsed = ownershipTransferSchema.safeParse(t);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((x) => `${x.path.map(String).join('.')}: ${x.message}`));
      }
      await backend.apply([
        put('ownershipTransfers', t.id, t),
        audit(call, clientOf(t), 'ownership.request', t.id, undefined, { toUserId: t.toUserId, status: t.status }),
      ]);
      return structuredClone(t);
    },

    async accept(ctx, id) {
      const call = await beginCall(backend, options, ctx);
      return step(call, id, 'ownership.accept', (t) => acceptTransfer(t, call.actor.user.id, clockOf(call)));
    },

    async confirmWithCode(ctx, id, code) {
      const call = await beginCall(backend, options, ctx);
      const before = await load(call, id);
      const ready = must(confirmTransferTwoFactor(before, call.actor.user.id, clockOf(call)));
      const given = text(code).trim();
      const failure = given === '' ? 'stepUpRequired' : given !== demoTwoFactorCode ? 'wrongCode' : undefined;
      if (failure) {
        await backend.apply([
          audit(call, clientOf(before), 'ownership.confirmFailed', before.id, undefined, { reason: failure }),
        ]);
        throw new RuleError(failure);
      }
      await backend.apply([
        put('ownershipTransfers', ready.id, ready),
        audit(call, clientOf(ready), 'ownership.confirm', ready.id, undefined, { status: ready.status }),
      ]);
      return structuredClone(ready);
    },

    async complete(ctx, id) {
      const call = await beginCall(backend, options, ctx);
      const before = await load(call, id);
      if (!involved(call, before)) return forbid('permission');
      const next = must(completeTransfer(before, clockOf(call)));
      const clientId = clientOf(next);
      const owners = await ownerRoleIds(call, next.side, clientId);
      const ownerRole = [...owners].sort()[0];
      if (!ownerRole) throw new RuleError('notApplicable');
      const users = await call.all<UserAccount>('users');
      const target = users.find((u) => u.id === next.toUserId);
      const demoted = (await call.all<Role>('roles')).find((r) => r.id === next.demoteFromTo);
      if (!target || target.status !== 'active' || !demoted || owners.has(demoted.id)) {
        throw new RuleError('notApplicable');
      }
      const assignments = await call.all<RoleAssignment>('roleAssignments');
      const active = (userId: string) => assignments.filter((a) => a.userId === userId && a.status === 'active');
      const old = active(next.fromUserId).filter((a) => a.roleIds.some((r) => owners.has(r)));
      const first = old[0];
      if (!first) throw new RuleError('notApplicable');

      const ops: WriteOp[] = [];
      // New owner: add the owner role to their active assignment, or give them one with the old owner's scope.
      const gain = active(next.toUserId)[0];
      const gained: RoleAssignment = gain
        ? { ...gain, roleIds: [...new Set([...gain.roleIds, ownerRole])] }
        : {
            id: call.newId(),
            userId: next.toUserId,
            roleIds: [ownerRole],
            scope: structuredClone(first.scope),
            grants: [],
            denies: [],
            status: 'active',
          };
      ops.push(put('roleAssignments', gained.id, gained));
      let after = [...assignments.filter((a) => a.id !== gained.id), gained];
      // Old owner: owner roles replaced by the demoted role. The guard makes sure an owner always remains.
      for (const a of old) {
        for (const roleId of a.roleIds.filter((r) => owners.has(r))) {
          const roles = await call.all<Role>('roles');
          if (!lastOwnerGuard({ type: 'removeRole', assignmentId: a.id, roleId }, after, roles, call.actor.now).ok) {
            return forbid('lastOwner');
          }
        }
        const swapped: RoleAssignment = {
          ...a,
          roleIds: [...new Set([...a.roleIds.filter((r) => !owners.has(r)), demoted.id])],
        };
        after = after.map((x) => (x.id === swapped.id ? swapped : x));
        ops.push(put('roleAssignments', swapped.id, swapped));
      }
      ops.push(
        put('ownershipTransfers', next.id, next),
        audit(call, clientId, 'ownership.complete', next.id, { status: before.status }, { status: next.status }),
      );
      await backend.apply(ops);
      return structuredClone(next);
    },

    async cancel(ctx, id) {
      const call = await beginCall(backend, options, ctx);
      return step(call, id, 'ownership.cancel', (t) => cancelTransfer(t, call.actor.user.id, clockOf(call)));
    },

    async list(ctx) {
      const call = await beginCall(backend, options, ctx);
      return structuredClone(
        (await all(call)).filter((t) => sameSide(call, t) && involved(call, t)).sort((a, b) => (a.id < b.id ? -1 : 1)),
      );
    },
  };
}
