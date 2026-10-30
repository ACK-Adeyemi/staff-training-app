import { useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MessageKey } from '@sta/content';
import { holdsAnywhere, type Incident, type MaintenanceApp } from '@sta/domain';
import { Badge, Button, PageHeader } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';
import { fieldClass } from '../client/feedbackShared';
import { usePermissions } from '../client/queries';

type UpdateStatus = Incident['updates'][number]['status'];
const POST_LEVELS = ['degraded', 'incident'] as const;
const FOLLOW_UPS: UpdateStatus[] = ['identified', 'monitoring', 'resolved'];
const APPS: MaintenanceApp[] = ['staff', 'client', 'provider'];

const box = 'mb-6 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4';

function IncidentRow({ incident, onChanged }: { incident: Incident; onChanged: () => Promise<void> }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const [status, setStatus] = useState<UpdateStatus>('identified');
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const resolved = incident.resolvedAt !== undefined;
  const save = useMutation({
    mutationFn: () => store.incidents.update(actor, incident.id, { status, message: message.trim() }),
    onSuccess: async () => {
      setMessage('');
      setFailed(false);
      await onChanged();
    },
    onError: () => {
      setFailed(true);
    },
  });
  const statusId = `inc-${incident.id}-status`;
  const messageId = `inc-${incident.id}-message`;
  const onSubmit = (e: SyntheticEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setFailed(true);
      return;
    }
    save.mutate();
  };

  return (
    <li
      data-testid="incident-row"
      data-incident-id={incident.id}
      className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3"
    >
      <p className="m-0 flex flex-wrap items-center gap-2 font-bold">
        {incident.title}
        <Badge>{t(`provider.status.level.${incident.level}` as MessageKey)}</Badge>
        {resolved ? <Badge>{t('provider.status.update.resolved')}</Badge> : null}
      </p>
      <ol className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
        {[...incident.updates]
          .sort((a, b) => a.at.localeCompare(b.at))
          .map((u, i) => (
            <li key={`${u.at}-${i}`} data-testid="incident-update">
              <strong>{t(`provider.status.update.${u.status}` as MessageKey)}</strong> {u.at.slice(0, 10)}: {u.message}
            </li>
          ))}
      </ol>
      {!resolved ? (
        <form onSubmit={onSubmit} noValidate className="mt-2 flex flex-col gap-2">
          <label htmlFor={statusId} className="font-semibold">
            {t('provider.status.updateStatus')}
          </label>
          <select
            id={statusId}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as UpdateStatus);
            }}
            className={fieldClass}
          >
            {FOLLOW_UPS.map((s) => (
              <option key={s} value={s}>
                {t(`provider.status.update.${s}` as MessageKey)}
              </option>
            ))}
          </select>
          <label htmlFor={messageId} className="font-semibold">
            {t('provider.status.message')}
          </label>
          <input
            id={messageId}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
            }}
            className={fieldClass}
          />
          {failed ? <p role="alert">{t('provider.status.updateFailed')}</p> : null}
          <div>
            <Button type="submit" disabled={save.isPending}>
              {t('provider.status.addUpdate')}
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

/** P17: current status, incidents and maintenance switches. */
export function Status() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const perms = usePermissions();
  const canPost = perms.data ? holdsAnywhere(perms.data, 'incidents.post') : false;
  const canSwitch = perms.data ? holdsAnywhere(perms.data, 'ops.write') : false;

  const [level, setLevel] = useState<(typeof POST_LEVELS)[number]>('degraded');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const incidents = useQuery({
    queryKey: ['incidents', 'list', actor.userId],
    queryFn: () => store.incidents.list(actor),
    enabled: canPost,
  });
  const current = useQuery({
    queryKey: ['incidents', 'current', actor.userId],
    queryFn: () => store.incidents.current(actor),
    enabled: canPost,
  });
  const flags = useQuery({
    queryKey: ['maintenance', actor.userId],
    queryFn: () => store.maintenance.flags(actor),
    enabled: canPost,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['incidents'] });

  const post = useMutation({
    mutationFn: () => store.incidents.post(actor, { level, title: title.trim(), message: message.trim() }),
    onSuccess: async () => {
      setTitle('');
      setMessage('');
      setError(null);
      await refresh();
    },
    onError: () => {
      setError(t('provider.status.post.failed'));
    },
  });
  const toggle = useMutation({
    mutationFn: (input: { app: MaintenanceApp; on: boolean }) => store.maintenance.set(actor, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['maintenance'] }),
  });

  const onPost = (e: SyntheticEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError(t('provider.status.post.titleError'));
      return;
    }
    post.mutate();
  };

  if (!perms.data || (canPost && (!incidents.data || !current.data || !flags.data))) {
    return <p>{t('shell.loading')}</p>;
  }
  const now = current.data;
  const sw = flags.data;

  return (
    <>
      <PageHeader title={t('provider.status.heading')} />
      {!canPost || !now || !sw ? (
        <p role="alert">{t('provider.status.noAccess')}</p>
      ) : (
        <>
          <section aria-label={t('provider.status.current')} className={box}>
            <h2 className="mt-0 text-lg font-bold">{t('provider.status.current')}</h2>
            <p className="m-0 text-lg font-bold">{t(`provider.status.level.${now.level}` as MessageKey)}</p>
            {now.title ? <p className="m-0 font-bold">{now.title}</p> : null}
            <p className="m-0">{now.message ?? t(`provider.status.levelMessage.${now.level}` as MessageKey)}</p>
          </section>

          <section aria-label={t('provider.status.incidents')} className={box}>
            <h2 className="mt-0 text-lg font-bold">{t('provider.status.incidents')}</h2>
            {(incidents.data ?? []).length === 0 ? <p>{t('provider.status.none')}</p> : null}
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {(incidents.data ?? []).map((i) => (
                <IncidentRow key={i.id} incident={i} onChanged={refresh} />
              ))}
            </ul>
          </section>

          <section aria-label={t('provider.status.post.heading')} className={box}>
            <h2 className="mt-0 text-lg font-bold">{t('provider.status.post.heading')}</h2>
            <form onSubmit={onPost} noValidate className="flex flex-col gap-3">
              <label htmlFor="st-level" className="font-semibold">
                {t('provider.status.post.level')}
              </label>
              <select
                id="st-level"
                value={level}
                onChange={(e) => {
                  setLevel(e.target.value as (typeof POST_LEVELS)[number]);
                }}
                className={fieldClass}
              >
                {POST_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t(`provider.status.level.${l}` as MessageKey)}
                  </option>
                ))}
              </select>
              <label htmlFor="st-title" className="font-semibold">
                {t('provider.status.post.title')}
              </label>
              <input
                id="st-title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
                className={fieldClass}
              />
              <label htmlFor="st-message" className="font-semibold">
                {t('provider.status.message')}
              </label>
              <textarea
                id="st-message"
                rows={2}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                }}
                className={fieldClass}
              />
              {error ? <p role="alert">{error}</p> : null}
              <div>
                <Button type="submit" disabled={post.isPending}>
                  {t('provider.status.post.submit')}
                </Button>
              </div>
            </form>
          </section>

          <section aria-label={t('provider.status.maintenance')} className={box}>
            <h2 className="mt-0 text-lg font-bold">{t('provider.status.maintenance')}</h2>
            <p className="m-0">{t('provider.status.maintenanceHelp')}</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {APPS.map((app) => {
                const on = sw[app];
                return (
                  <button
                    key={app}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={t(`provider.status.app.${app}` as MessageKey)}
                    disabled={!canSwitch || toggle.isPending}
                    onClick={() => {
                      toggle.mutate({ app, on: !on });
                    }}
                    className="inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-2 rounded-full border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 font-semibold focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-6 w-11 items-center rounded-full border-2 border-[var(--color-text)] px-0.5 ${on ? 'justify-end bg-[var(--color-accent)]' : 'justify-start bg-transparent'}`}
                    >
                      <span className="h-4 w-4 rounded-full bg-[var(--color-text)]" />
                    </span>
                    <span aria-hidden="true">
                      {t(`provider.status.app.${app}` as MessageKey)}:{' '}
                      {on ? t('provider.status.on') : t('provider.status.off')}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </>
      )}
    </>
  );
}
