// C5 Auto-assign rules (brief 21.2): the list with plain sentences, on/off, who it would give training to now,
// history, and the editor. Rules and names come from the data layer and the domain `ruleSentence`.
import { useState, type SyntheticEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NotEntitledError, RuleError } from '@sta/data';
import type { MessageKey } from '@sta/content';
import { Button, Card, Dialog, PageHeader } from '@sta/ui';
import { can, ruleSentence, type AutoAssignRule, type RuleNames } from '@sta/domain';
import { useActor, useStore, useT } from '../../app/hooks';
import { field } from './organiseShared';
import { fullName, orEmpty, usePermissions } from './queries';

type Lookups = {
  jobRoles: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  sites: { id: string; name: string }[];
  modules: { id: string; title: string }[];
  groups: { id: string; name: string }[];
  requirements: { id: string; name: string; satisfiedByModuleIds: string[] }[];
};
type Row = { rule: AutoAssignRule; count: number };

const byName = (list: { id: string; name: string }[]) => Object.fromEntries(list.map((x) => [x.id, x.name]));

/** Names for the sentence. A module that is not in the library (the seeded induction) is named by the requirement it satisfies. */
export function namesFor(l: Lookups): RuleNames {
  const modules: Record<string, string> = {};
  for (const r of l.requirements) for (const id of r.satisfiedByModuleIds) modules[id] = r.name;
  for (const m of l.modules) modules[m.id] = m.title;
  return {
    jobRoles: byName(l.jobRoles),
    teams: byName(l.teams),
    sites: byName(l.sites),
    modules,
    groups: byName(l.groups),
    requirements: byName(l.requirements),
  };
}

function useRules() {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: ['rules', actor.userId],
    queryFn: async () => {
      const [rules, jobRoles, teams, sites, modules, groups, requirements] = await Promise.all([
        store.autoAssign.list(actor),
        orEmpty(store.jobRoles.list(actor)),
        orEmpty(store.teams.list(actor)),
        orEmpty(store.sites.list(actor)),
        orEmpty(store.modules.list(actor)),
        orEmpty(store.moduleGroups.list(actor)),
        orEmpty(store.requirements.list(actor)),
      ]);
      const rows: Row[] = await Promise.all(
        rules.map(async (rule) => ({ rule, count: (await store.autoAssign.preview(actor, rule.id)).count })),
      );
      const lookups: Lookups = {
        jobRoles,
        teams,
        sites,
        modules: modules.filter((m) => m.status === 'published').map((m) => ({ id: m.id, title: m.title })),
        groups,
        requirements,
      };
      return { rows, lookups };
    },
  });
}

function useSentence() {
  const t = useT();
  return (rule: AutoAssignRule, names: RuleNames): string => {
    const s = ruleSentence(rule, names);
    const w = (k: 'role' | 'team' | 'site') => (s.params[k] === undefined ? [] : [String(s.params[k])]);
    const place = w('site')[0] ? t('rules.who.site', { site: w('site')[0] ?? '' }) : t('rules.who.anySite');
    const team = w('team')[0] ? [t('rules.who.team', { team: w('team')[0] ?? '' })] : [];
    const role = w('role')[0] ? [t('rules.who.role', { role: w('role')[0] ?? '' })] : [];
    const base = { training: String(s.params.training), dueInDays: Number(s.params.dueInDays) };
    if (rule.trigger.type === 'personAdded') {
      return t('rules.sentence.personAdded', { ...base, details: [...role, ...team, place].join(' ') });
    }
    if (rule.trigger.type === 'roleChanged') {
      return t('rules.sentence.roleChanged', {
        ...base,
        role: w('role')[0] ?? t('rules.anyJobRole').toLocaleLowerCase('en-GB'),
        details: [...team, place].join(' '),
      });
    }
    const filters = [...role, ...team, ...(w('site')[0] ? [place] : [])];
    return t('rules.sentence.requirementExpiring', {
      ...base,
      days: Number(s.params.days),
      requirement: String(s.params.requirement),
      only: filters.length > 0 ? ' ' + t('rules.who.only', { details: filters.join(' ') }) : '',
    });
  };
}

/** The heading shows once the rules have loaded (or when access is refused), so it never sits above a half-drawn page. */
export function Rules() {
  const t = useT();
  const actor = useActor();
  const perms = usePermissions();
  if (!perms.data) return <p>{t('shell.loading')}</p>;
  if (actor.clientId === undefined || !can(perms.data, 'assign.manage', { clientId: actor.clientId })) {
    return (
      <>
        <PageHeader title={t('rules.title')} />
        <p role="alert">{t('errors.forbidden')}</p>
      </>
    );
  }
  return <RulesContent />;
}

function RulesContent() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const q = useRules();
  const sentence = useSentence();
  const [editing, setEditing] = useState<AutoAssignRule | 'new' | null>(null);
  const [showHistory, setShowHistory] = useState<string | null>(null);
  const [problem, setProblem] = useState(false);
  if (q.isError) return <p role="alert">{t('client.loadError')}</p>;
  if (!q.data) return <p>{t('shell.loading')}</p>;
  const { rows, lookups } = q.data;
  const names = namesFor(lookups);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['rules'] });
  const toggle = async (rule: AutoAssignRule) => {
    setProblem(false);
    try {
      await store.autoAssign.setEnabled(actor, rule.id, !rule.enabled);
      await refresh();
    } catch {
      setProblem(true);
    }
  };

  return (
    <>
      <PageHeader title={t('rules.title')} />
      <p className="mt-0">{t('rules.intro')}</p>
      <div className="mb-4">
        <Button
          onClick={() => {
            setEditing('new');
          }}
        >
          {t('rules.add')}
        </Button>
      </div>
      {problem ? <p role="alert">{t('rules.errorSave')}</p> : null}
      {rows.length === 0 ? <p>{t('rules.empty')}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {rows.map(({ rule, count }) => (
          <li key={rule.id}>
            <Card className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="m-0 text-lg font-bold">{rule.name}</h2>
                <button
                  type="button"
                  role="switch"
                  aria-checked={rule.enabled}
                  aria-label={rule.name}
                  onClick={() => void toggle(rule)}
                  className="inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-2 rounded-full border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 font-semibold focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-6 w-11 items-center rounded-full border-2 border-[var(--color-text)] px-0.5 ${rule.enabled ? 'justify-end bg-[var(--color-accent)]' : 'justify-start bg-transparent'}`}
                  >
                    <span className="h-4 w-4 rounded-full bg-[var(--color-text)]" />
                  </span>
                  <span>{rule.enabled ? t('rules.enabled') : t('rules.disabled')}</span>
                </button>
              </div>
              <p className="m-0">{sentence(rule, names)}</p>
              <p className="m-0 text-sm">
                {count === 0
                  ? t('rules.previewNone')
                  : count === 1
                    ? t('rules.previewOne')
                    : t('rules.preview', { count })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  aria-label={t('rules.editFor', { name: rule.name })}
                  onClick={() => {
                    setEditing(rule);
                  }}
                >
                  {t('rules.edit')}
                </Button>
                <Button
                  variant="secondary"
                  aria-label={t('rules.historyFor', { name: rule.name })}
                  aria-expanded={showHistory === rule.id}
                  onClick={() => {
                    setShowHistory(showHistory === rule.id ? null : rule.id);
                  }}
                >
                  {t('rules.history')}
                </Button>
              </div>
              {showHistory === rule.id ? <History ruleId={rule.id} /> : null}
            </Card>
          </li>
        ))}
      </ul>
      <Dialog
        open={editing !== null}
        title={editing === 'new' || editing === null ? t('rules.add') : t('rules.edit')}
        onClose={() => {
          setEditing(null);
        }}
      >
        {editing !== null ? (
          <RuleForm
            key={editing === 'new' ? 'new' : editing.id}
            existing={editing === 'new' ? undefined : editing}
            lookups={lookups}
            onClose={() => {
              setEditing(null);
            }}
            onSaved={refresh}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function History({ ruleId }: { ruleId: string }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const q = useQuery({
    queryKey: ['rules', 'history', actor.userId, ruleId],
    queryFn: async () => {
      const [assignments, people] = await Promise.all([
        store.autoAssign.history(actor, ruleId),
        orEmpty(store.people.list(actor)),
      ]);
      const ids = [...new Set(assignments.map((a) => a.personId))];
      return ids.map((id) => {
        const p = people.find((x) => x.id === id);
        return { id, name: p ? fullName(p) : t('rules.someone') };
      });
    },
  });
  if (q.isError) return <p role="alert">{t('client.loadError')}</p>;
  if (!q.data) return <p>{t('shell.loading')}</p>;
  if (q.data.length === 0) return <p className="m-0">{t('rules.noHistory')}</p>;
  return (
    <ul aria-label={t('rules.history')} className="m-0 list-disc pl-6">
      {q.data.map((p) => (
        <li key={p.id}>{p.name}</li>
      ))}
    </ul>
  );
}

const errorKey = (e: unknown): MessageKey =>
  e instanceof RuleError && e.rule === 'duplicateRule'
    ? 'rules.duplicate'
    : e instanceof NotEntitledError
      ? 'rules.limit'
      : 'rules.errorSave';

const KEEP_ROLES = 'keep';

function RuleForm({
  existing,
  lookups,
  onClose,
  onSaved,
}: {
  existing: AutoAssignRule | undefined;
  lookups: Lookups;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const names = namesFor(lookups);
  const initialAction = existing
    ? 'moduleId' in existing.action
      ? `m:${existing.action.moduleId}`
      : `g:${existing.action.groupId}`
    : '';
  const [name, setName] = useState(existing?.name ?? '');
  const [trigger, setTrigger] = useState<AutoAssignRule['trigger']['type']>(existing?.trigger.type ?? 'personAdded');
  // A rule saved with several job roles keeps them unless the user picks something else.
  const keptRoles = existing?.filters.jobRoleIds ?? [];
  const severalRoles = keptRoles.length > 1;
  const [role, setRole] = useState(severalRoles ? KEEP_ROLES : (keptRoles[0] ?? ''));
  const [requirementId, setRequirementId] = useState(
    existing?.trigger.type === 'requirementExpiring'
      ? existing.trigger.requirementId
      : (lookups.requirements[0]?.id ?? ''),
  );
  const [days, setDays] = useState(existing?.trigger.type === 'requirementExpiring' ? existing.trigger.days : 60);
  const [training, setTraining] = useState(initialAction || (lookups.modules[0] ? `m:${lookups.modules[0].id}` : ''));
  const [dueIn, setDueIn] = useState(existing?.dueInDays ?? 14);
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  const trainingOptions = [
    ...lookups.modules.map((m) => ({ value: `m:${m.id}`, label: m.title })),
    ...lookups.groups.map((g) => ({ value: `g:${g.id}`, label: t('rules.group', { name: g.name }) })),
  ];
  if (initialAction && !trainingOptions.some((o) => o.value === initialAction)) {
    const id = initialAction.slice(2);
    trainingOptions.unshift({ value: initialAction, label: names.modules[id] ?? names.groups[id] ?? id });
  }

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (name.trim() === '') {
      setError('rules.errorNoName');
      return;
    }
    if (training === '') {
      setError('rules.errorNoTraining');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const otherFilters = { ...existing?.filters };
      delete otherFilters.jobRoleIds;
      await store.autoAssign.save(actor, {
        ...(existing ? { id: existing.id } : {}),
        name: name.trim(),
        enabled: existing?.enabled ?? true,
        trigger: trigger === 'requirementExpiring' ? { type: trigger, days, requirementId } : { type: trigger },
        filters: {
          ...otherFilters,
          ...(role === KEEP_ROLES ? { jobRoleIds: keptRoles } : role ? { jobRoleIds: [role] } : {}),
        },
        action: training.startsWith('g:') ? { groupId: training.slice(2) } : { moduleId: training.slice(2) },
        dueInDays: dueIn,
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 font-semibold">
        {t('rules.name')}
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        {t('rules.trigger.label')}
        <select
          value={trigger}
          onChange={(e) => {
            setTrigger(e.target.value as typeof trigger);
          }}
          className={field}
        >
          {(['personAdded', 'roleChanged', 'requirementExpiring'] as const).map((k) => (
            <option key={k} value={k}>
              {t(`rules.trigger.${k}`)}
            </option>
          ))}
        </select>
      </label>
      {trigger === 'requirementExpiring' ? (
        <>
          <label className="flex flex-col gap-1 font-semibold">
            {t('rules.requirement')}
            <select
              value={requirementId}
              onChange={(e) => {
                setRequirementId(e.target.value);
              }}
              className={field}
            >
              {lookups.requirements.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 font-semibold">
            {t('rules.daysBefore')}
            <input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => {
                setDays(Number(e.target.value));
              }}
              className={field}
            />
          </label>
        </>
      ) : null}
      <label className="flex flex-col gap-1 font-semibold">
        {t('client.people.jobRole')}
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
          }}
          className={field}
        >
          <option value="">{t('rules.anyJobRole')}</option>
          {severalRoles ? (
            <option value={KEEP_ROLES}>
              {t('rules.severalJobRoles', { names: keptRoles.map((id) => names.jobRoles[id] ?? id).join(', ') })}
            </option>
          ) : null}
          {lookups.jobRoles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        {t('rules.training')}
        <select
          value={training}
          onChange={(e) => {
            setTraining(e.target.value);
          }}
          className={field}
        >
          {trainingOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        {t('rules.dueIn')}
        <input
          type="number"
          min={0}
          max={365}
          value={dueIn}
          onChange={(e) => {
            setDueIn(Number(e.target.value));
          }}
          className={field}
        />
      </label>
      {error ? <p role="alert">{t(error)}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {t('rules.save')}
        </Button>
        <Button variant="quiet" onClick={onClose}>
          {t('rules.cancel')}
        </Button>
      </div>
    </form>
  );
}
