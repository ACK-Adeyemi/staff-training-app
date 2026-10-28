// C18 Team and roles: who can do what, invitations, custom roles, two-step status and the activity log (brief 22.4 to 22.6).
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Icon, PageHeader } from '@sta/ui';
import {
  can,
  clientCatalogue,
  clientRoleTemplates,
  effectivePermissions,
  twoFactorStatus,
  type ClientLevels,
  type EffectivePermission,
  type Role,
  type RoleAssignment,
  type Scope,
  type Site,
} from '@sta/domain';
import { ForbiddenError, ValidationError, type TeamMember } from '@sta/data';
import type { MessageKey } from '@sta/content';
import { useActor, useStore, useT } from '../../app/hooks';
import { formatLondonDateTime } from '../../demo/format';
import { foundationsErrorKey, inputClass } from './foundationsErrors';
import { useTeam } from './foundationsQueries';
import { usePermissions } from './queries';

type Notice = { kind: 'ok' | 'error'; text: string } | null;

const PREVIEW_AREAS: { permission: string; label: MessageKey }[] = [
  { permission: 'staff.view', label: 'nav.client.people' },
  { permission: 'modules.view', label: 'nav.client.training' },
  { permission: 'competitions.view', label: 'nav.client.engage' },
  { permission: 'reports.view', label: 'nav.client.reports' },
  { permission: 'settings.view', label: 'nav.client.settings' },
  { permission: 'team.manageRoles', label: 'team.title' },
];
const KNOWN_ACTIONS = new Set([
  'invite',
  'setAccess',
  'revoke',
  'saveCustomRole',
  'removeCustomRole',
  'updateProfile',
  'updateSettings',
  'updateSite',
  'enrolled',
  'markDone',
]);

const allSitesScope = (clientId: string): Scope => ({ type: 'clients', ids: [clientId] });

function permissionsFor(
  userId: string,
  roleIds: string[],
  scope: Scope,
  roles: Role[],
  now: Date,
): EffectivePermission[] {
  const assignment: RoleAssignment = {
    id: 'preview',
    userId,
    roleIds,
    scope,
    grants: [],
    denies: [],
    status: 'active',
  };
  return effectivePermissions(userId, [assignment], roles, now);
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-4">
      <Card>
        <h2 id={id} className="mt-0 mb-3 text-lg font-bold">
          {title}
        </h2>
        {children}
      </Card>
    </section>
  );
}

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

function YesNo({ yes, yesLabel, noLabel }: { yes: boolean; yesLabel: string; noLabel: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon name={yes ? 'check' : 'x-circle'} size={16} />
      {yes ? yesLabel : noLabel}
    </span>
  );
}

export function Team() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const perms = usePermissions();
  const clientId = actor.clientId ?? '';
  const canManage = perms.data ? can(perms.data, 'team.manageRoles', { clientId }) : undefined;
  const team = useTeam(canManage);
  const [notice, setNotice] = useState<Notice>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [previewRole, setPreviewRole] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('');
  const [inviteWhere, setInviteWhere] = useState('all');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [roleName, setRoleName] = useState('');
  const [template, setTemplate] = useState('none');

  if (team.isError) {
    return (
      <>
        <PageHeader title={t('team.title')} />
        <p role="alert">{t(team.error instanceof ForbiddenError ? 'errors.forbidden' : 'team.loadError')}</p>
      </>
    );
  }
  if (!team.data) return <p>{t('shell.loading')}</p>;
  const { members, roles: allRoles, users, sites, activity, now } = team.data;
  const roles = allRoles.filter((r) => r.owner !== 'provider' && r.owner.clientId === clientId);
  const nameOfRole = (id: string) => roles.find((r) => r.id === id)?.name ?? '';
  const visible = members.filter((m) => m.status !== 'suspended');
  const memberName = (id: string) => members.find((m) => m.userId === id)?.displayName ?? '';
  const siteName = (id: string) => sites.find((s: Site) => s.id === id)?.name ?? '';

  const run = async (work: () => Promise<string | undefined>, onError?: (e: unknown) => MessageKey) => {
    setNotice(null);
    try {
      const text = await work();
      if (text) setNotice({ kind: 'ok', text });
      await queryClient.invalidateQueries();
    } catch (e) {
      setNotice({ kind: 'error', text: t(onError ? onError(e) : foundationsErrorKey(e)) });
    }
  };

  const scopeText = (m: TeamMember): string => {
    const scope = m.scope;
    if (!scope || scope.type === 'clients' || scope.type === 'all') return t('team.scopeAll');
    if (scope.type === 'own') return t('team.scopeOwn');
    return t('team.scopeSite', { names: scope.ids.map(siteName).join(', ') });
  };
  const twoFactorText = (m: TeamMember): string | null => {
    const user = users.find((u) => u.id === m.userId);
    if (!user) return null;
    const s = twoFactorStatus(user, now);
    if (s.kind === 'grace')
      return s.daysLeft === 1 ? t('twoFactor.daysLeftOne') : t('twoFactor.daysLeft', { days: s.daysLeft });
    if (s.kind === 'limited') return t('twoFactor.limited');
    return t('twoFactor.enrolled');
  };

  const invite = (e: SyntheticEvent) => {
    e.preventDefault();
    const roleId = inviteRole || roles[0]?.id || '';
    void run(async () => {
      await store.team.invite(actor, {
        email: inviteEmail,
        roleIds: roleId ? [roleId] : [],
        scope: inviteWhere === 'all' ? allSitesScope(clientId) : { type: 'sites', ids: [inviteWhere] },
      });
      setInviteEmail('');
      return t('team.invited');
    });
  };
  const saveRole = (e: SyntheticEvent) => {
    e.preventDefault();
    const source = clientRoleTemplates.find((x) => x.key === template);
    const none = Object.fromEntries(
      Object.keys(clientRoleTemplates[0]?.levels ?? {}).map((k) => [k, 'none']),
    ) as ClientLevels;
    void run(async () => {
      await store.team.saveCustomRole(actor, {
        name: roleName,
        levels: source?.levels ?? none,
        allows: source?.allows ?? [],
      });
      setRoleName('');
      return t('team.roleSaved');
    });
  };

  const panelFor = (m: TeamMember) => {
    const scope = m.scope ?? allSitesScope(clientId);
    const effective = permissionsFor(m.userId, m.roleIds, scope, roles, now);
    const target = { clientId, ...(scope.type === 'sites' ? { siteIds: scope.ids } : {}) };
    return (
      <div className="mt-3 flex flex-col gap-1">
        <p className="m-0 font-semibold">{t('team.canDoTitle', { name: m.displayName })}</p>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {clientCatalogue.map((p) => {
            const allowed = can(effective, p.id, target);
            return (
              <li key={p.id} data-testid={`can-do-${p.id}`} data-allowed={String(allowed)}>
                <YesNo yes={allowed} yesLabel={t('team.canYes')} noLabel={t('team.canNo')} />
                {': '}
                {t(`team.permission.${p.area}.${p.action}` as MessageKey)}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const previewFor = (role: Role) => {
    const effective = permissionsFor('preview', [role.id], allSitesScope(clientId), roles, now);
    return (
      <div data-testid="role-preview" className="mt-3 flex flex-col gap-1">
        <p className="m-0 font-semibold">{t('team.previewTitle', { name: role.name })}</p>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {PREVIEW_AREAS.map((a) => (
            <li key={a.permission}>
              {t(a.label)}
              {': '}
              <YesNo
                yes={can(effective, a.permission, { clientId })}
                yesLabel={t('team.previewSee')}
                noLabel={t('team.previewNoSee')}
              />
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const previewed = roles.find((r) => r.id === previewRole);

  return (
    <>
      <PageHeader title={t('team.title')} />
      <p className="mt-0">{t('team.intro')}</p>
      {notice ? (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className="font-semibold">
          {notice.text}
        </p>
      ) : null}

      <Section id="c18-members" title={t('team.members')}>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {visible.map((m) => {
            const self = m.userId === actor.userId;
            const locked = m.accessLocked !== undefined;
            const twoFactorLine = twoFactorText(m);
            const chosen = edits[m.userId] ?? m.roleIds[0] ?? '';
            return (
              <li key={m.userId} className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3">
                <p className="m-0 font-bold">
                  {m.displayName}
                  {self ? ` (${t('team.you')})` : ''}
                </p>
                <p className="m-0">{m.roleIds.map(nameOfRole).filter(Boolean).join(', ')}</p>
                <p className="m-0">{scopeText(m)}</p>
                {twoFactorLine ? (
                  <p data-testid={`team-2fa-${m.userId}`} className="m-0">
                    {twoFactorLine}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <Button
                    variant="secondary"
                    aria-expanded={openFor === m.userId}
                    onClick={() => {
                      setOpenFor(openFor === m.userId ? null : m.userId);
                    }}
                  >
                    {t('team.whatCanDo', { name: m.displayName })}
                  </Button>
                  {canManage ? (
                    <>
                      <Field id={`c18-role-${m.userId}`} label={t('team.memberRole', { name: m.displayName })}>
                        <select
                          id={`c18-role-${m.userId}`}
                          value={chosen}
                          disabled={locked}
                          onChange={(e) => {
                            setEdits({ ...edits, [m.userId]: e.target.value });
                          }}
                          className={inputClass}
                        >
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Button
                        variant="secondary"
                        disabled={locked || chosen === m.roleIds[0]}
                        onClick={() => {
                          void run(async () => {
                            await store.team.setAccess(actor, m.userId, {
                              roleIds: [chosen],
                              scope: m.scope ?? allSitesScope(clientId),
                            });
                            return t('team.accessSaved');
                          });
                        }}
                      >
                        {t('team.save')}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={locked}
                        aria-label={t('team.revokeNamed', { name: m.displayName })}
                        onClick={() => {
                          void run(async () => {
                            await store.team.revoke(actor, m.userId);
                            return t('team.revoked');
                          });
                        }}
                      >
                        {t('team.revoke')}
                      </Button>
                    </>
                  ) : null}
                </div>
                {openFor === m.userId ? panelFor(m) : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 mb-0">{t('team.ownerNote')}</p>
      </Section>

      {canManage ? (
        <Section id="c18-invite" title={t('team.inviteTitle')}>
          <form onSubmit={invite} noValidate className="flex flex-col gap-3">
            <Field id="c18-email" label={t('team.email')}>
              <input
                id="c18-email"
                type="email"
                autoComplete="off"
                value={inviteEmail}
                onChange={(e) => {
                  setInviteEmail(e.target.value);
                }}
                className={inputClass}
              />
            </Field>
            <Field id="c18-invite-role" label={t('team.role')}>
              <select
                id="c18-invite-role"
                value={inviteRole || roles[0]?.id || ''}
                onChange={(e) => {
                  setInviteRole(e.target.value);
                }}
                className={inputClass}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="c18-invite-where" label={t('team.where')}>
              <select
                id="c18-invite-where"
                value={inviteWhere}
                onChange={(e) => {
                  setInviteWhere(e.target.value);
                }}
                className={inputClass}
              >
                <option value="all">{t('team.scopeAll')}</option>
                {sites.map((s: Site) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <Button type="submit">{t('team.invite')}</Button>
            </div>
          </form>
        </Section>
      ) : null}

      <Section id="c18-roles" title={t('team.roles')}>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {roles.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{r.name}</span>
              <span>{r.system ? t('team.systemRole') : t('team.customRole')}</span>
              <Button
                variant="quiet"
                aria-label={t('team.previewRoleNamed', { name: r.name })}
                onClick={() => {
                  setPreviewRole(r.id);
                }}
              >
                {t('team.previewRole')}
              </Button>
              {canManage && !r.system ? (
                <Button
                  variant="quiet"
                  aria-label={t('team.removeRoleNamed', { name: r.name })}
                  onClick={() => {
                    void run(
                      async () => {
                        await store.team.removeCustomRole(actor, r.id);
                        return undefined;
                      },
                      (e) => (e instanceof ValidationError ? 'team.roleInUse' : foundationsErrorKey(e)),
                    );
                  }}
                >
                  {t('team.removeRole')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {previewed ? previewFor(previewed) : null}
      </Section>

      {canManage ? (
        <Section id="c18-new-role" title={t('team.newRole')}>
          <form onSubmit={saveRole} noValidate className="flex flex-col gap-3">
            <Field id="c18-role-name" label={t('team.roleName')}>
              <input
                id="c18-role-name"
                type="text"
                value={roleName}
                onChange={(e) => {
                  setRoleName(e.target.value);
                }}
                className={inputClass}
              />
            </Field>
            <Field id="c18-template" label={t('team.startFrom')}>
              <select
                id="c18-template"
                value={template}
                onChange={(e) => {
                  setTemplate(e.target.value);
                }}
                className={inputClass}
              >
                <option value="none">{t('team.startFromNothing')}</option>
                {clientRoleTemplates.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="m-0 text-sm">{t('team.templateHelp')}</p>
            <div>
              <Button type="submit">{t('team.saveRole')}</Button>
            </div>
          </form>
        </Section>
      ) : null}

      {canManage ? (
        <Section id="c18-activity" title={t('team.activity')}>
          {activity.length === 0 ? (
            <p className="m-0">{t('team.activityEmpty')}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {activity.slice(0, 20).map((a) => {
                const last = a.action.split('.').pop() ?? '';
                const action = t(`team.activityActions.${KNOWN_ACTIONS.has(last) ? last : 'other'}` as MessageKey);
                return (
                  <li key={a.id}>
                    {t('team.activityLine', { name: memberName(a.actorId) || t('team.you'), action })}
                    {' - '}
                    {formatLondonDateTime(a.at)}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      ) : null}
    </>
  );
}
