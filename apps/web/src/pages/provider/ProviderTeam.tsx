// P18 Team and roles (M4 chunk 15a, BP-8, brief 22.2 to 22.4). Members, invites, the role editor with dependencies,
// compare, effective permissions and the provider ownership transfer. Everything goes through the data layer; what shows
// depends on holdsAnywhere() of the signed-in person's permissions, never on role names.
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MessageKey } from '@sta/content';
import { ForbiddenError, ValidationError, type ProviderTeamMember } from '@sta/data';
import {
  compareRoles,
  dependantsOf,
  effectiveWithSources,
  holdsAnywhere,
  providerCatalogue,
  providerRoleTemplates,
  withDependencies,
  type OwnershipTransfer,
  type Role,
} from '@sta/domain';
import { Button, PageHeader } from '@sta/ui';
import { useActor, useClock, useStore, useT } from '../../app/hooks';
import { inputClass } from '../client/foundationsErrors';
import { usePermissions } from '../client/queries';

const DAY_MS = 86_400_000;
const box = 'mb-6 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4';
const OWNERISH = new Set(['providerOwner', 'providerCoOwner']);
const describeOf = (id: string): string => providerCatalogue.find((p) => p.id === id)?.description ?? id;
const isProviderRole = (r: Role): boolean => r.owner === 'provider';
const isOwnerish = (r: Role): boolean => r.systemKey !== undefined && OWNERISH.has(r.systemKey);
/** The key the data layer takes for a role: the template key for system roles, the id for custom ones. */
const roleKeyOf = (r: Role): string =>
  (r.system ? providerRoleTemplates.find((x) => x.systemKey === r.systemKey)?.key : undefined) ?? r.id;
const byName = (a: Role, b: Role): number => a.name.localeCompare(b.name);

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}

type Editor = { roleId: string | null; name: string; description: string; ids: string[] };

export function Team() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  const queryClient = useQueryClient();
  const perms = usePermissions();
  const holds = (p: string): boolean => (perms.data ? holdsAnywhere(perms.data, p) : false);
  const canRead = holds('team.read');
  const canManage = holds('team.manage');
  const canRoles = holds('roles.manage');
  const canTransfer = holds('owner.transfer');
  const canOwnerRoles = holds('owner.manageOwnerRoles');

  const [memberError, setMemberError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('');
  const [inviteFailed, setInviteFailed] = useState(false);
  const [effectiveFor, setEffectiveFor] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [note, setNote] = useState('');
  const [blocked, setBlocked] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [after, setAfter] = useState('');
  const [code, setCode] = useState('');
  const [transferError, setTransferError] = useState(false);

  const data = useQuery({
    queryKey: ['providerTeamPage', actor.userId],
    queryFn: async () => {
      const [members, roles, assignments, transfers] = await Promise.all([
        store.providerTeam.list(actor),
        store.roles.list(actor),
        store.roleAssignments.list(actor),
        store.ownership.list(actor),
      ]);
      return { members, roles: roles.filter(isProviderRole), assignments, transfers };
    },
    enabled: canRead,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['providerTeamPage'] });

  if (!perms.data || (canRead && !data.data && !data.isError)) return <p>{t('shell.loading')}</p>;
  if (!canRead) {
    return (
      <>
        <PageHeader title={t('provider.team.heading')} />
        <p>{t('provider.team.noAccess')}</p>
      </>
    );
  }
  if (!data.data) {
    return (
      <>
        <PageHeader title={t('provider.team.heading')} />
        <p role="alert">{t('provider.team.loadError')}</p>
      </>
    );
  }
  const { members, roles, assignments, transfers } = data.data;
  const sortedRoles = [...roles].sort(byName);
  const usableRoles = sortedRoles.filter((r) => canOwnerRoles || !isOwnerish(r));
  const nameOfUser = (id: string): string => members.find((m) => m.userId === id)?.name ?? '';
  const now = clock.now();

  const changed = async (work: () => Promise<unknown>) => {
    setMemberError('');
    try {
      await work();
      await refresh();
    } catch (e) {
      setMemberError(
        e instanceof ForbiddenError && e.reason === 'lastOwner'
          ? t('provider.team.lastOwner')
          : t('provider.team.changeError'),
      );
    }
  };

  const sendInvite = async (e: SyntheticEvent) => {
    e.preventDefault();
    setInviteFailed(false);
    const roleId = inviteRole || usableRoles[0]?.id || '';
    const role = roles.find((r) => r.id === roleId);
    try {
      await store.providerTeam.invite(actor, {
        email: inviteEmail,
        displayName: inviteName,
        roleKey: role ? roleKeyOf(role) : '',
      });
      setInviteEmail('');
      setInviteName('');
      await refresh();
    } catch {
      setInviteFailed(true);
    }
  };

  const currentRole = (m: ProviderTeamMember): Role | undefined => roles.find((r) => r.id === m.roleIds[0]);

  const effectiveRows = (userId: string) =>
    effectiveWithSources(
      userId,
      assignments.filter((a) => a.userId === userId),
      roles,
      now,
    ).filter((p) => providerCatalogue.some((c) => c.id === p.permissionId));

  // Role editor.
  const openEditor = (e: Editor) => {
    setEditor(e);
    setNote('');
    setBlocked('');
  };
  const toggle = (id: string, on: boolean) => {
    if (!editor) return;
    if (on) {
      const next = withDependencies([...editor.ids, id], providerCatalogue);
      const added = next.filter((x) => x !== id && !editor.ids.includes(x));
      setEditor({ ...editor, ids: next });
      setBlocked('');
      setNote(added.length ? t('provider.team.addedDeps', { names: added.map(describeOf).join(', ') }) : '');
      return;
    }
    const needed = dependantsOf(id, providerCatalogue).filter((x) => editor.ids.includes(x));
    if (needed.length) {
      setNote('');
      setBlocked(t('provider.team.blockedRemove', { names: needed.map(describeOf).join(', ') }));
      return;
    }
    setBlocked('');
    setNote('');
    setEditor({ ...editor, ids: editor.ids.filter((x) => x !== id) });
  };
  const saveRole = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (!editor) return;
    const input = { name: editor.name, description: editor.description, permissionIds: editor.ids };
    try {
      if (editor.roleId) await store.providerTeam.updateRole(actor, editor.roleId, input);
      else await store.providerTeam.createRole(actor, input);
      setEditor(null);
      setNote('');
      setBlocked('');
      await refresh();
    } catch (err) {
      setNote('');
      setBlocked(
        err instanceof ValidationError || err instanceof ForbiddenError
          ? t('provider.team.saveError')
          : t('provider.team.changeError'),
      );
    }
  };

  // Compare.
  const fromRole = roles.find((r) => r.id === from);
  const toRole = roles.find((r) => r.id === to);
  const diff = fromRole && toRole ? compareRoles(fromRole.permissionIds, toRole.permissionIds) : null;

  // Ownership transfer.
  const hasOpen = transfers.some((x) => x.status === 'pending');
  const candidates = members.filter((m) => m.userId !== actor.userId && m.status === 'active');
  const afterRoles = sortedRoles.filter((r) => !isOwnerish(r));
  const transferWork = async (work: () => Promise<unknown>) => {
    setTransferError(false);
    try {
      await work();
      await refresh();
    } catch {
      setTransferError(true);
    }
  };
  const startTransfer = (e: SyntheticEvent) => {
    e.preventDefault();
    void transferWork(async () => {
      await store.ownership.request(actor, {
        side: 'provider',
        toUserId: newOwner || candidates[0]?.userId || '',
        demoteFromTo: after || afterRoles[0]?.id || '',
      });
      setCode('');
    });
  };
  const transferStatus = (x: OwnershipTransfer): string => {
    if (x.status === 'done') return t('provider.team.transfer.status.done');
    if (x.status === 'cancelled') return t('provider.team.transfer.status.cancelled');
    const name = nameOfUser(x.toUserId);
    if (x.twoFactorConfirmedAt) {
      const days = Math.ceil((new Date(x.coolingOffEndsAt).getTime() - now.getTime()) / DAY_MS);
      if (days <= 0) return t('provider.team.transfer.status.ready');
      return days === 1
        ? t('provider.team.transfer.status.confirmedOne')
        : t('provider.team.transfer.status.confirmed', { days });
    }
    return x.acceptedAt
      ? t('provider.team.transfer.status.accepted', { name })
      : t('provider.team.transfer.status.requested', { name });
  };

  const areas = [...new Set(providerCatalogue.map((p) => p.area))];
  const shownEffective = effectiveFor ? members.find((m) => m.userId === effectiveFor) : undefined;

  return (
    <>
      <PageHeader title={t('provider.team.heading')} />
      {!canManage && !canRoles ? <p>{t('provider.team.readOnly')}</p> : null}

      <section aria-labelledby="p18-members" className={box}>
        <h2 id="p18-members" className="mt-0 text-lg font-bold">
          {t('provider.team.members')}
        </h2>
        {memberError ? (
          <p role="alert" className="font-semibold">
            {memberError}
          </p>
        ) : null}
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {members.map((m) => {
            const current = currentRole(m);
            const selectId = `p18-role-${m.userId}`;
            return (
              <li
                key={m.userId}
                data-testid="member-row"
                data-user-id={m.userId}
                className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3"
              >
                <p className="m-0 font-bold">{m.name}</p>
                <p className="m-0">{m.roleNames.join(', ')}</p>
                <p className="m-0">{t(`provider.team.status.${m.status}` as MessageKey)}</p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <Button
                    variant="secondary"
                    aria-expanded={effectiveFor === m.userId}
                    onClick={() => {
                      setEffectiveFor(effectiveFor === m.userId ? null : m.userId);
                    }}
                  >
                    {t('provider.team.effective')}
                  </Button>
                  {canManage ? (
                    <>
                      <Field id={selectId} label={t('provider.team.changeRole')}>
                        <select
                          id={selectId}
                          value={current?.id ?? ''}
                          onChange={(e) => {
                            const role = roles.find((r) => r.id === e.target.value);
                            if (role) void changed(() => store.providerTeam.setRole(actor, m.userId, roleKeyOf(role)));
                          }}
                          className={inputClass}
                        >
                          {current ? null : <option value="" disabled />}
                          {usableRoles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {m.status === 'suspended' ? (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            void changed(() => store.providerTeam.reactivate(actor, m.userId));
                          }}
                        >
                          {t('provider.team.reactivate')}
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            void changed(() => store.providerTeam.suspend(actor, m.userId));
                          }}
                        >
                          {t('provider.team.suspend')}
                        </Button>
                      )}
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {shownEffective ? (
        <section aria-labelledby="p18-effective" className={box}>
          <h2 id="p18-effective" className="mt-0 text-lg font-bold">
            {t('provider.team.effectiveFor', { name: shownEffective.name })}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {effectiveRows(shownEffective.userId).map((p) => (
              <li key={p.permissionId} data-testid="effective-row" data-permission-id={p.permissionId}>
                {describeOf(p.permissionId)}
                {' - '}
                {p.sources
                  .map((s) =>
                    s.roleName
                      ? t('provider.team.grantedBy', { role: s.roleName })
                      : t('provider.team.grantedDirectly'),
                  )
                  .join(', ')}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canManage ? (
        <section aria-labelledby="p18-invite" className={box}>
          <h2 id="p18-invite" className="mt-0 text-lg font-bold">
            {t('provider.team.invite.heading')}
          </h2>
          <form onSubmit={(e) => void sendInvite(e)} noValidate className="flex flex-col gap-3">
            <Field id="p18-email" label={t('provider.team.invite.email')}>
              <input
                id="p18-email"
                type="email"
                autoComplete="off"
                value={inviteEmail}
                onChange={(e) => {
                  setInviteEmail(e.target.value);
                }}
                className={inputClass}
              />
            </Field>
            <Field id="p18-name" label={t('provider.team.invite.name')}>
              <input
                id="p18-name"
                type="text"
                autoComplete="off"
                value={inviteName}
                onChange={(e) => {
                  setInviteName(e.target.value);
                }}
                className={inputClass}
              />
            </Field>
            <Field id="p18-invite-role" label={t('provider.team.invite.role')}>
              <select
                id="p18-invite-role"
                value={inviteRole || usableRoles[0]?.id || ''}
                onChange={(e) => {
                  setInviteRole(e.target.value);
                }}
                className={inputClass}
              >
                {usableRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            {inviteFailed ? (
              <p role="alert" className="m-0 font-semibold">
                {t('provider.team.invite.error')}
              </p>
            ) : null}
            <div>
              <Button type="submit">{t('provider.team.invite.submit')}</Button>
            </div>
          </form>
        </section>
      ) : null}

      <section aria-labelledby="p18-roles" className={box}>
        <h2 id="p18-roles" className="mt-0 text-lg font-bold">
          {t('provider.team.roles')}
        </h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {sortedRoles.map((r) => (
            <li key={r.id} data-testid="role-row" data-role-id={r.id} className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{r.name}</span>
              <span>{r.system ? t('provider.team.system') : t('provider.team.custom')}</span>
              {canRoles && !r.system ? (
                <Button
                  variant="quiet"
                  onClick={() => {
                    openEditor({ roleId: r.id, name: r.name, description: r.description, ids: r.permissionIds });
                  }}
                >
                  {t('provider.team.edit')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {canRoles ? (
          <div className="mt-3">
            <Button
              variant="secondary"
              onClick={() => {
                openEditor({ roleId: null, name: '', description: '', ids: [] });
              }}
            >
              {t('provider.team.new')}
            </Button>
          </div>
        ) : null}
      </section>

      {canRoles && editor ? (
        <section aria-labelledby="p18-editor" className={box}>
          <h2 id="p18-editor" className="mt-0 text-lg font-bold">
            {t('provider.team.editor')}
          </h2>
          <form onSubmit={(e) => void saveRole(e)} noValidate className="flex flex-col gap-3">
            <Field id="p18-role-name" label={t('provider.team.roleName')}>
              <input
                id="p18-role-name"
                type="text"
                value={editor.name}
                onChange={(e) => {
                  setEditor({ ...editor, name: e.target.value });
                }}
                className={inputClass}
              />
            </Field>
            <Field id="p18-role-description" label={t('provider.team.roleDescription')}>
              <input
                id="p18-role-description"
                type="text"
                value={editor.description}
                onChange={(e) => {
                  setEditor({ ...editor, description: e.target.value });
                }}
                className={inputClass}
              />
            </Field>
            {areas.map((area) => (
              <fieldset
                key={area}
                data-testid="perm-area"
                data-area={area}
                className="m-0 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3"
              >
                <legend className="px-1 font-bold">{t(`provider.team.area.${area}` as MessageKey)}</legend>
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {providerCatalogue
                    .filter((p) => p.area === area)
                    .map((p) => (
                      <li
                        key={p.id}
                        data-testid="perm-row"
                        data-permission-id={p.id}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <label className="flex min-h-[var(--target-min)] items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editor.ids.includes(p.id)}
                            onChange={(e) => {
                              toggle(p.id, e.target.checked);
                            }}
                            className="size-5"
                          />
                          {p.description}
                        </label>
                        {p.sensitive ? <strong>{t('provider.team.sensitive')}</strong> : null}
                      </li>
                    ))}
                </ul>
              </fieldset>
            ))}
            {note ? <p role="status">{note}</p> : null}
            {blocked ? (
              <p role="alert" className="font-semibold">
                {blocked}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit">{t('provider.team.save')}</Button>
              <Button
                variant="quiet"
                onClick={() => {
                  setEditor(null);
                  setNote('');
                  setBlocked('');
                }}
              >
                {t('provider.team.cancelEdit')}
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <section aria-labelledby="p18-compare" className={box}>
        <h2 id="p18-compare" className="mt-0 text-lg font-bold">
          {t('provider.team.compare')}
        </h2>
        <div className="flex flex-wrap gap-3">
          {(
            [
              ['p18-from', 'provider.team.from', from, setFrom],
              ['p18-to', 'provider.team.to', to, setTo],
            ] as const
          ).map(([id, label, value, set]) => (
            <Field key={id} id={id} label={t(label)}>
              <select
                id={id}
                value={value}
                onChange={(e) => {
                  set(e.target.value);
                }}
                className={inputClass}
              >
                <option value="">{t('provider.team.chooseRole')}</option>
                {sortedRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
        {diff ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(
              [
                ['compare-added', 'provider.team.added', diff.added],
                ['compare-removed', 'provider.team.removed', diff.removed],
              ] as const
            ).map(([testId, label, ids]) => (
              <div key={testId}>
                <h3 className="m-0 font-bold">{t(label)}</h3>
                <ul data-testid={testId} className="m-0 list-none p-0">
                  {ids.length ? (
                    ids.map((id) => <li key={id}>{describeOf(id)}</li>)
                  ) : (
                    <li>{t('provider.team.none')}</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {canTransfer || transfers.length > 0 ? (
        <section aria-labelledby="p18-transfer" className={box}>
          <h2 id="p18-transfer" className="mt-0 text-lg font-bold">
            {t('provider.team.transfer.heading')}
          </h2>
          {transferError ? (
            <p role="alert" className="font-semibold">
              {t('provider.team.transfer.error')}
            </p>
          ) : null}
          {canTransfer ? (
            <form onSubmit={startTransfer} noValidate className="flex flex-col gap-3">
              <Field id="p18-new-owner" label={t('provider.team.transfer.newOwner')}>
                <select
                  id="p18-new-owner"
                  value={newOwner || candidates[0]?.userId || ''}
                  onChange={(e) => {
                    setNewOwner(e.target.value);
                  }}
                  className={inputClass}
                >
                  {candidates.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="p18-after" label={t('provider.team.transfer.afterwards')}>
                <select
                  id="p18-after"
                  value={after || afterRoles[0]?.id || ''}
                  onChange={(e) => {
                    setAfter(e.target.value);
                  }}
                  className={inputClass}
                >
                  {afterRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div>
                <Button type="submit" disabled={hasOpen}>
                  {t('provider.team.transfer.start')}
                </Button>
              </div>
            </form>
          ) : null}
          <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
            {transfers.map((x) => {
              const open = x.status === 'pending';
              const mine = x.fromUserId === actor.userId;
              const waiting = now.getTime() < new Date(x.coolingOffEndsAt).getTime();
              return (
                <li
                  key={x.id}
                  data-testid="transfer-row"
                  className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3"
                >
                  <p className="m-0 font-semibold">{transferStatus(x)}</p>
                  {open && x.toUserId === actor.userId && !x.acceptedAt ? (
                    <Button
                      className="mt-2"
                      onClick={() => {
                        void transferWork(() => store.ownership.accept(actor, x.id));
                      }}
                    >
                      {t('provider.team.transfer.accept')}
                    </Button>
                  ) : null}
                  {open && mine && x.acceptedAt && !x.twoFactorConfirmedAt ? (
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <Field id={`p18-code-${x.id}`} label={t('provider.team.transfer.code')}>
                        <input
                          id={`p18-code-${x.id}`}
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={code}
                          onChange={(e) => {
                            setCode(e.target.value);
                          }}
                          className={inputClass}
                        />
                      </Field>
                      <Button
                        onClick={() => {
                          void transferWork(() => store.ownership.confirmWithCode(actor, x.id, code));
                        }}
                      >
                        {t('provider.team.transfer.confirm')}
                      </Button>
                    </div>
                  ) : null}
                  {open && mine && x.twoFactorConfirmedAt ? (
                    <div className="mt-2 flex flex-col gap-2">
                      <div>
                        <Button
                          disabled={waiting}
                          onClick={() => {
                            void transferWork(() => store.ownership.complete(actor, x.id));
                          }}
                        >
                          {t('provider.team.transfer.complete')}
                        </Button>
                      </div>
                      {waiting ? <p className="m-0">{t('provider.team.transfer.completeWaiting')}</p> : null}
                    </div>
                  ) : null}
                  {open && (mine || x.toUserId === actor.userId) ? (
                    <Button
                      variant="quiet"
                      className="mt-2"
                      onClick={() => {
                        void transferWork(() => store.ownership.cancel(actor, x.id));
                      }}
                    >
                      {t('provider.team.transfer.cancel')}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </>
  );
}
