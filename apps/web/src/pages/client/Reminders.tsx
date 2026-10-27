// C16 Reminders: the policy form (weekly limit, quiet hours, messages), the manager digest preview and Chase all overdue.
// Business rules are in the domain (checkReminderTemplate, chasePreview) and the data layer; this page only shows them.
import { useState, type SyntheticEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MessageKey } from '@sta/content';
import { Button, Card, Dialog, PageHeader } from '@sta/ui';
import { checkReminderTemplate, defaultReminderText, holdsAnywhere } from '@sta/domain';
import type { ChaseResult, ReminderPolicy } from '@sta/data';
import { useActor, useStore, useT } from '../../app/hooks';
import { field } from './organiseShared';
import { PermissionGate } from './PermissionGate';
import { fullName, orEmpty, usePermissions } from './queries';

const KINDS = ['dueSoon', 'overdue', 'expiring'] as const;
const TONES = ['friendly', 'neutral', 'brief'] as const;
type Kind = (typeof KINDS)[number];
type Tone = (typeof TONES)[number];
type Templates = Record<string, { tone: Tone; text?: string }>;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ALLOWED = '{firstName}, {training} and {date}';

function useReminders() {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: ['reminders', actor.userId],
    queryFn: async () => {
      if (!actor.clientId) throw new Error('This account has no client.');
      const [policy, client, people, digest] = await Promise.all([
        store.reminders.policy(actor),
        store.clients.get(actor, actor.clientId),
        orEmpty(store.people.list(actor)),
        store.reminders.digestPreview(actor).catch(() => ({ overdue: [], expiring: [] })),
      ]);
      return { policy, templates: client.settings.reminderTemplates as Templates, people, digest };
    },
  });
}

export function Reminders() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('reminders.title')} />
      <PermissionGate permission="reminders.view" message="errors.forbidden">
        <RemindersContent />
      </PermissionGate>
    </>
  );
}

function RemindersContent() {
  const t = useT();
  const q = useReminders();
  const perms = usePermissions();
  const [notice, setNotice] = useState<string | null>(null);
  if (q.isError) return <p role="alert">{t('client.loadError')}</p>;
  if (!q.data || !perms.data) return <p>{t('shell.loading')}</p>;
  const { policy, templates, people, digest } = q.data;
  const canManage = holdsAnywhere(perms.data, 'reminders.manage');
  const nameOf = (id: string) => {
    const p = people.find((x) => x.id === id);
    return p ? fullName(p) : t('rules.someone');
  };
  return (
    <>
      <p className="mt-0">{t('reminders.intro')}</p>
      {notice ? <p role="status">{notice}</p> : null}
      <SettingsForm
        policy={policy}
        templates={templates}
        canManage={canManage}
        onSaved={() => {
          setNotice(t('reminders.saved'));
        }}
      />
      <section aria-labelledby="digest-h" className="mt-6">
        <h2 id="digest-h" className="mb-2 text-lg font-bold">
          {t('reminders.digest')}
        </h2>
        <p className="mt-0">{t('reminders.digestNote')}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <PeopleList
            title={t('reminders.digestOverdue')}
            ids={digest.overdue.map((p) => p.personId)}
            nameOf={nameOf}
          />
          <PeopleList
            title={t('reminders.digestExpiring')}
            ids={digest.expiring.map((p) => p.personId)}
            nameOf={nameOf}
          />
        </div>
      </section>
      {canManage ? (
        <Chase
          nameOf={nameOf}
          onSent={(n) => {
            setNotice(t('reminders.sentCount', { count: n }));
          }}
        />
      ) : null}
    </>
  );
}

function PeopleList({ title, ids, nameOf }: { title: string; ids: string[]; nameOf: (id: string) => string }) {
  const t = useT();
  const id = `digest-${title.replace(/\W+/g, '-')}`;
  return (
    <Card>
      <h3 id={id} className="mt-0 mb-2 text-base font-bold">
        {title}
      </h3>
      <ul aria-labelledby={id} className="m-0 list-disc pl-6">
        {ids.length === 0 ? <li>{t('reminders.digestNobody')}</li> : ids.map((p) => <li key={p}>{nameOf(p)}</li>)}
      </ul>
    </Card>
  );
}

function SettingsForm({
  policy,
  templates,
  canManage,
  onSaved,
}: {
  policy: ReminderPolicy;
  templates: Templates;
  canManage: boolean;
  onSaved: () => void;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const [cap, setCap] = useState(String(policy.weeklyCapPerPerson));
  const [from, setFrom] = useState(policy.quietHours.from);
  const [to, setTo] = useState(policy.quietHours.to);
  const [tones, setTones] = useState<Record<Kind, Tone>>(
    () => Object.fromEntries(KINDS.map((k) => [k, templates[k]?.tone ?? 'friendly'])) as Record<Kind, Tone>,
  );
  // null = the person has not written their own, so the box shows the default for the chosen tone.
  const [texts, setTexts] = useState<Record<Kind, string | null>>(
    () => Object.fromEntries(KINDS.map((k) => [k, templates[k]?.text ?? null])) as Record<Kind, string | null>,
  );
  const [error, setError] = useState<string | null>(null);
  const shown = (k: Kind) => texts[k] ?? defaultReminderText(k, tones[k]);

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d+$/.test(cap.trim())) {
      setError(t('reminders.errorCap'));
      return;
    }
    if (!TIME.test(from) || !TIME.test(to)) {
      setError(t('reminders.errorQuiet'));
      return;
    }
    const next: Templates = { ...templates };
    for (const k of KINDS) {
      const text = shown(k);
      const problem = checkReminderTemplate(text);
      if (problem === 'unknownPlaceholder') {
        setError(t('reminders.errorUnknownPlaceholder', { allowed: ALLOWED }));
        return;
      }
      if (problem !== 'ok') {
        setError(t('reminders.errorLength'));
        return;
      }
      next[k] = text === defaultReminderText(k, tones[k]) ? { tone: tones[k] } : { tone: tones[k], text };
    }
    try {
      await store.reminders.savePolicy(
        actor,
        { ...policy, weeklyCapPerPerson: Number(cap), quietHours: { from, to } },
        next,
      );
      await queryClient.invalidateQueries({ queryKey: ['reminders'] });
      onSaved();
    } catch {
      setError(t('reminders.errorSave'));
    }
  };

  return (
    <form aria-label={t('reminders.form')} noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <label className="flex max-w-xs flex-col gap-1 font-semibold">
        {t('reminders.weeklyCap')}
        <input
          type="number"
          min={0}
          value={cap}
          readOnly={!canManage}
          onChange={(e) => {
            setCap(e.target.value);
          }}
          className={field}
        />
      </label>
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 font-semibold">
          {t('reminders.quietFrom')}
          <input
            type="time"
            value={from}
            readOnly={!canManage}
            onChange={(e) => {
              setFrom(e.target.value);
            }}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          {t('reminders.quietTo')}
          <input
            type="time"
            value={to}
            readOnly={!canManage}
            onChange={(e) => {
              setTo(e.target.value);
            }}
            className={field}
          />
        </label>
      </div>
      {KINDS.map((k) => (
        <div key={k} className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 font-semibold">
            {t('reminders.messageFor', { kind: t(`reminders.kind.${k}`) })}
            <textarea
              rows={3}
              value={shown(k)}
              readOnly={!canManage}
              onChange={(e) => {
                setTexts({ ...texts, [k]: e.target.value });
              }}
              className={`${field} py-2`}
            />
          </label>
          <label className="flex max-w-xs flex-col gap-1 font-semibold">
            {t('reminders.toneFor', { kind: t(`reminders.kind.${k}`) })}
            <select
              value={tones[k]}
              disabled={!canManage}
              onChange={(e) => {
                setTones({ ...tones, [k]: e.target.value as Tone });
              }}
              className={field}
            >
              {TONES.map((tone) => (
                <option key={tone} value={tone}>
                  {t(`reminders.tone.${tone}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ))}
      {error ? <p role="alert">{error}</p> : null}
      {canManage ? (
        <div>
          <Button type="submit">{t('reminders.save')}</Button>
        </div>
      ) : null}
    </form>
  );
}

function Chase({ nameOf, onSent }: { nameOf: (id: string) => string; onSent: (n: number) => void }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<ChaseResult | null>(null);
  const [error, setError] = useState(false);
  const open = async () => {
    setError(false);
    try {
      setPreview(await store.reminders.chaseOverdue(actor, { preview: true }));
    } catch {
      setError(true);
    }
  };
  const send = async () => {
    if (!preview) return;
    try {
      const result = await store.reminders.send(
        actor,
        preview.willSend.map((p) => p.personId),
      );
      setPreview(null);
      await queryClient.invalidateQueries();
      onSent(result.sent.length);
    } catch {
      setError(true);
    }
  };
  return (
    <div className="mt-6">
      <Button variant="secondary" onClick={() => void open()}>
        {t('reminders.chaseAll')}
      </Button>
      {error ? <p role="alert">{t('reminders.chaseError')}</p> : null}
      <Dialog
        open={preview !== null}
        title={t('reminders.chaseAll')}
        onClose={() => {
          setPreview(null);
        }}
      >
        {preview ? (
          <div className="flex flex-col gap-4">
            {preview.willSend.length === 0 ? (
              <p className="m-0">{t('reminders.nobodyWillGet')}</p>
            ) : (
              <div>
                <h3 id="chase-will" className="mt-0 mb-1 text-base font-bold">
                  {t('reminders.willSend')}
                </h3>
                <ul aria-labelledby="chase-will" className="m-0 list-disc pl-6">
                  {preview.willSend.map((p) => (
                    <li key={p.personId}>{nameOf(p.personId)}</li>
                  ))}
                </ul>
              </div>
            )}
            {preview.skipped.length > 0 ? (
              <div>
                <h3 id="chase-skipped" className="mt-0 mb-1 text-base font-bold">
                  {t('reminders.skipped')}
                </h3>
                <ul aria-labelledby="chase-skipped" className="m-0 list-disc pl-6">
                  {preview.skipped.map((p) => (
                    <li key={p.personId}>
                      {nameOf(p.personId)}: {t(`reminders.skip.${p.reason}` as MessageKey)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {preview.willSend.length > 0 ? <Button onClick={() => void send()}>{t('reminders.send')}</Button> : null}
              <Button
                variant="quiet"
                onClick={() => {
                  setPreview(null);
                }}
              >
                {t('reminders.cancel')}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
