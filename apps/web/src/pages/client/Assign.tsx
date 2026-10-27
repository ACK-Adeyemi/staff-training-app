import { useState, type SyntheticEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AccountStateError, ForbiddenError, NotFoundError, RuleError, ValidationError } from '@sta/data';
import type { MessageKey } from '@sta/content';
import { Button, Card, PageHeader } from '@sta/ui';
import { can, dueAtFromLondonDate, londonDateString, planAssignment } from '@sta/domain';
import { useActor, useClock, useStore, useT } from '../../app/hooks';
import { useSiteScope } from '../../app/siteScope';
import { fullName, useClientData, usePermissions } from './queries';

type Result = { created: number; skipped: string[] };

function errorKey(e: unknown): MessageKey {
  if (e instanceof RuleError) {
    switch (e.rule) {
      case 'dueInPast':
        return 'client.assign.errors.dueInPast';
      case 'tooMany':
        return 'client.assign.errors.tooMany';
      case 'invalidPeople':
        return 'client.assign.errors.invalidPeople';
      case 'moduleNotPublished':
        return 'client.assign.errors.moduleNotPublished';
      default:
        return 'client.assign.errors.generic';
    }
  }
  if (e instanceof ForbiddenError) return 'client.assign.errors.forbidden';
  if (e instanceof AccountStateError) {
    return e.state === 'readOnly' || e.state === 'paused'
      ? 'client.assign.errors.readOnly'
      : 'client.assign.errors.accountState';
  }
  if (e instanceof ValidationError || e instanceof NotFoundError) return 'client.assign.errors.validation';
  return 'client.assign.errors.generic';
}

const field =
  'min-h-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]';

/** C4: one module, some people, one due date, one Assign press. */
export function Assign() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  const queryClient = useQueryClient();
  const q = useClientData();
  const perms = usePermissions();
  const site = useSiteScope();
  const [moduleId, setModuleId] = useState('');
  const [groupId, setGroupId] = useState('');
  const groupsQ = useQuery({
    queryKey: ['moduleGroups', actor.userId],
    queryFn: () => store.moduleGroups.list(actor),
  });
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [errorMsg, setErrorMsg] = useState<MessageKey | null>(null);

  if (q.isError) return <p role="alert">{t('client.loadError')}</p>;
  if (!q.data || !perms.data || (!groupsQ.data && !groupsQ.isError)) return <p>{t('shell.loading')}</p>;
  const { view, assignments, modules, accountState } = q.data;
  const held = perms.data;
  const allowed = held.some((p) => p.permissionId === 'assign.manage');
  const readOnly = accountState === 'readOnly' || accountState === 'paused';
  const blocked = !allowed ? 'client.assign.noPermission' : readOnly ? 'client.assign.errors.readOnly' : null;

  const published = modules.filter((m) => m.status === 'published');
  const choosable = view.people
    .filter((p) => p.status !== 'archived')
    .filter((p) => site === 'all' || p.primarySiteId === site)
    .filter((p) =>
      can(held, 'assign.manage', { clientId: p.clientId, siteIds: [p.primarySiteId, ...p.additionalSiteIds] }, 'write'),
    )
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));

  const plan = moduleId
    ? planAssignment({
        moduleId,
        personIds: [...picked],
        people: view.people,
        existing: assignments,
        dueAt: due ? safeDue(due) : '',
        now: clock.now(),
      })
    : null;
  const group = groupsQ.data?.find((g) => g.id === groupId);
  const groupPlans = group
    ? group.moduleIds.map((id) =>
        planAssignment({
          moduleId: id,
          personIds: [...picked],
          people: view.people,
          existing: assignments,
          dueAt: due ? safeDue(due) : '',
          now: clock.now(),
        }),
      )
    : null;
  const count = groupPlans ? groupPlans.reduce((n, p) => n + p.toCreate.length, 0) : (plan?.toCreate.length ?? 0);
  const skippedCount = groupPlans ? groupPlans.reduce((n, p) => n + p.skipped.length, 0) : (plan?.skipped.length ?? 0);

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    setResult(null);
    if ((!moduleId && !groupId) || picked.size === 0 || !due) {
      setErrorMsg('client.assign.errors.validation');
      return;
    }
    let dueAt: string;
    try {
      dueAt = dueAtFromLondonDate(due);
    } catch {
      setErrorMsg('client.assign.errors.validation');
      return;
    }
    setErrorMsg(null);
    setBusy(true);
    try {
      const out = groupId
        ? await store.assignments.assignGroup(actor, { groupId, personIds: [...picked], dueAt })
        : await store.assignments.assign(actor, { moduleId, personIds: [...picked], dueAt });
      const names = new Map(view.people.map((p) => [p.id, fullName(p)]));
      setResult({ created: out.created.length, skipped: out.skipped.map((s) => names.get(s.personId) ?? '') });
      setPicked(new Set());
      void queryClient.invalidateQueries();
    } catch (err) {
      setErrorMsg(errorKey(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t('client.assign.title')} />
      <form
        onSubmit={(e) => {
          void submit(e);
        }}
        className="flex max-w-2xl flex-col gap-4"
        noValidate
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="assign-module" className="font-semibold">
            {t('client.assign.module')}
          </label>
          <select
            id="assign-module"
            value={moduleId}
            onChange={(e) => {
              setModuleId(e.target.value);
              if (e.target.value) setGroupId('');
            }}
            className={field}
          >
            <option value="">{t('client.assign.chooseModule')}</option>
            {published.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="assign-group" className="font-semibold">
            {t('client.assign.group')}
          </label>
          <select
            id="assign-group"
            value={groupId}
            onChange={(e) => {
              setGroupId(e.target.value);
              if (e.target.value) setModuleId('');
            }}
            className={field}
          >
            <option value="">{t('client.assign.chooseGroup')}</option>
            {(groupsQ.data ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="mb-1 font-semibold">{t('client.assign.people')}</legend>
          {choosable.length === 0 ? <p className="m-0">{t('client.assign.noPeople')}</p> : null}
          <Card className="grid grid-cols-1 gap-1 md:grid-cols-2">
            {choosable.map((p) => (
              <label key={p.id} className="flex min-h-[var(--target-min)] cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={picked.has(p.id)}
                  onChange={() => {
                    toggle(p.id);
                  }}
                  className="h-6 w-6 shrink-0"
                />
                <span>{fullName(p)}</span>
              </label>
            ))}
          </Card>
        </fieldset>

        <div className="flex flex-col gap-1">
          <label htmlFor="assign-due" className="font-semibold">
            {t('client.assign.dueDate')}
          </label>
          <input
            id="assign-due"
            type="date"
            value={due}
            min={londonDateString(clock.now())}
            onChange={(e) => {
              setDue(e.target.value);
            }}
            className={`${field} max-w-xs`}
          />
        </div>

        <p className="m-0" aria-live="polite">
          {count === 0
            ? t('client.assign.previewNone')
            : count === 1
              ? t('client.assign.previewOne')
              : t('client.assign.preview', { count })}
        </p>
        {skippedCount > 0 ? <p className="m-0">{t('client.assign.previewSkipped', { count: skippedCount })}</p> : null}

        {blocked ? <p className="m-0 font-semibold">{t(blocked)}</p> : null}
        <div>
          <Button type="submit" disabled={busy || blocked !== null}>
            {t('client.assign.submit')}
          </Button>
        </div>

        {errorMsg ? (
          <p role="alert" className="m-0 font-semibold">
            {t(errorMsg)}
          </p>
        ) : null}
        {result ? (
          <div role="status" className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3">
            <p className="m-0 font-semibold">{t('client.assign.assigned', { count: result.created })}</p>
            {result.skipped.length > 0 ? (
              <>
                <p className="mt-2 mb-0 font-semibold">
                  {t('client.assign.skipped', { count: result.skipped.length })}
                </p>
                <ul className="m-0 pl-6">
                  {result.skipped.map((name, i) => (
                    <li key={`${name}-${i}`}>{t('client.assign.alreadyHas', { name })}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </form>
    </>
  );
}

function safeDue(day: string): string {
  try {
    return dueAtFromLondonDate(day);
  } catch {
    return '';
  }
}
