// C24 Settings: the organisation name (with a staff preview and name history), allowlisted settings and sites.
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, PageHeader } from '@sta/ui';
import { can, type Client, type Site } from '@sta/domain';
import { RuleError, ValidationError } from '@sta/data';
import type { MessageKey } from '@sta/content';
import { useActor, useStore, useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { foundationsErrorKey, inputClass } from './foundationsErrors';
import { useOrganisation, useSites } from './foundationsQueries';
import { focusLink } from '../staff/styles';
import { usePermissions } from './queries';

type Notice = { kind: 'ok' | 'error'; text: string } | null;

const REGION_KEYS = [
  'eastMidlands',
  'eastOfEngland',
  'london',
  'northEast',
  'northWest',
  'northernIreland',
  'scotland',
  'southEast',
  'southWest',
  'wales',
  'westMidlands',
  'yorkshire',
] as const;

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

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p role={notice.kind === 'error' ? 'alert' : 'status'} className="m-0 font-semibold">
      {notice.text}
    </p>
  );
}

/** Runs one save, then refreshes everything on screen. */
function useSave() {
  const queryClient = useQueryClient();
  const t = useT();
  const [notice, setNotice] = useState<Notice>(null);
  const save = async (work: () => Promise<unknown>, done: MessageKey, errorKey?: (e: unknown) => MessageKey) => {
    setNotice(null);
    try {
      await work();
      setNotice({ kind: 'ok', text: t(done) });
      await queryClient.invalidateQueries();
    } catch (e) {
      setNotice({ kind: 'error', text: t(errorKey ? errorKey(e) : foundationsErrorKey(e)) });
    }
  };
  return { notice, save };
}

function NameForm({ client, canEdit }: { client: Client; canEdit: boolean }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const { notice, save } = useSave();
  const [displayName, setDisplayName] = useState(client.displayName);
  const [shortName, setShortName] = useState(client.shortName ?? '');
  const changed = displayName !== client.displayName || shortName !== (client.shortName ?? '');
  const submit = (e: SyntheticEvent) => {
    e.preventDefault();
    const patch: { displayName?: string; shortName?: string } = {};
    if (displayName !== client.displayName) patch.displayName = displayName;
    if (shortName !== (client.shortName ?? '')) patch.shortName = shortName;
    void save(
      () => store.organisation.updateProfile(actor, patch),
      'org.saved',
      (err) => (err instanceof RuleError && err.rule === 'invalidName' ? 'org.invalidName' : foundationsErrorKey(err)),
    );
  };
  return (
    <>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <Field id="c24-name" label={t('org.displayName')}>
          <input
            id="c24-name"
            type="text"
            value={displayName}
            disabled={!canEdit}
            aria-describedby="c24-name-help"
            onChange={(e) => {
              setDisplayName(e.target.value);
            }}
            className={inputClass}
          />
        </Field>
        <p id="c24-name-help" className="m-0 text-sm">
          {t('org.nameHelp')}
        </p>
        <Field id="c24-short" label={t('org.shortName')}>
          <input
            id="c24-short"
            type="text"
            value={shortName}
            disabled={!canEdit}
            onChange={(e) => {
              setShortName(e.target.value);
            }}
            className={inputClass}
          />
        </Field>
        <div
          role="group"
          aria-labelledby="c24-preview-title"
          data-testid="staff-preview"
          className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3"
        >
          <p id="c24-preview-title" className="m-0 font-semibold">
            {t('org.staffPreview')}
          </p>
          <p className="m-0">{t('org.staffPreviewLine', { name: displayName })}</p>
        </div>
        <NoticeLine notice={notice} />
        {canEdit ? (
          <div>
            <Button type="submit" disabled={!changed}>
              {t('org.save')}
            </Button>
          </div>
        ) : null}
      </form>
      <section aria-labelledby="c24-history" className="mt-4">
        <h3 id="c24-history" className="mt-0 mb-2 text-base font-bold">
          {t('org.nameHistory')}
        </h3>
        {client.nameHistory.length === 0 ? (
          <p className="m-0">{t('org.nameHistoryEmpty')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {client.nameHistory.map((h) => (
              <li key={`${h.changedAt}-${h.new}`}>
                {t('org.nameHistoryLine', { old: h.old, new: h.new, date: formatLondonDate(h.changedAt) })}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function SettingsForm({ client, canEdit }: { client: Client; canEdit: boolean }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const { notice, save } = useSave();
  const s = client.settings;
  const [amber, setAmber] = useState(String(s.amberWindowDays));
  const [goal, setGoal] = useState(String(s.weeklyGoalLessons));
  const [aider, setAider] = useState(String(s.firstAiderThreshold));
  const [tickets, setTickets] = useState(s.allowStaffTickets);
  const [pulse, setPulse] = useState(s.pulseSurveys);
  const submit = (e: SyntheticEvent) => {
    e.preventDefault();
    void save(
      () =>
        store.organisation.updateSettings(actor, {
          amberWindowDays: Number(amber),
          weeklyGoalLessons: Number(goal),
          firstAiderThreshold: Number(aider),
          allowStaffTickets: tickets,
          pulseSurveys: pulse,
        }),
      'org.settings.saved',
      (err) => (err instanceof ValidationError ? 'org.settings.invalid' : foundationsErrorKey(err)),
    );
  };
  const number = (id: string, label: string, value: string, set: (v: string) => void, help?: string) => (
    <Field id={id} label={label}>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={value}
        disabled={!canEdit}
        {...(help ? { 'aria-describedby': `${id}-help` } : {})}
        onChange={(e) => {
          set(e.target.value);
        }}
        className={inputClass}
      />
      {help ? (
        <span id={`${id}-help`} className="text-sm">
          {help}
        </span>
      ) : null}
    </Field>
  );
  const check = (label: string, value: boolean, set: (v: boolean) => void) => (
    <label className="flex min-h-[var(--target-min)] items-center gap-3 font-semibold">
      <input
        type="checkbox"
        checked={value}
        disabled={!canEdit}
        onChange={(e) => {
          set(e.target.checked);
        }}
        className="size-6"
      />
      {label}
    </label>
  );
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      {number('c24-amber', t('org.settings.amberWindow'), amber, setAmber, t('org.settings.amberHelp'))}
      {number('c24-goal', t('org.settings.weeklyGoal'), goal, setGoal)}
      {number('c24-aider', t('org.settings.firstAider'), aider, setAider)}
      {check(t('org.settings.staffTickets'), tickets, setTickets)}
      {check(t('org.settings.pulse'), pulse, setPulse)}
      <NoticeLine notice={notice} />
      {canEdit ? (
        <div>
          <Button type="submit">{t('org.settings.saveSettings')}</Button>
        </div>
      ) : null}
    </form>
  );
}

function SiteRow({ site, canEdit }: { site: Site; canEdit: boolean }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const { notice, save } = useSave();
  const [name, setName] = useState(site.name);
  const [region, setRegion] = useState(site.region ?? '');
  const regions: string[] = REGION_KEYS.map((k) => t(`org.regions.${k}`));
  if (site.region && !regions.includes(site.region)) regions.push(site.region);
  const submit = (e: SyntheticEvent) => {
    e.preventDefault();
    const patch: { name?: string; region?: string } = {};
    if (name !== site.name) patch.name = name;
    if (region !== '' && region !== (site.region ?? '')) patch.region = region;
    void save(() => store.organisation.sites.update(actor, site.id, patch), 'org.siteSaved');
  };
  return (
    <li>
      <form role="group" aria-label={site.name} onSubmit={submit} noValidate className="flex flex-wrap items-end gap-3">
        <Field id={`c24-site-${site.id}`} label={t('org.sites.name')}>
          <input
            id={`c24-site-${site.id}`}
            type="text"
            value={name}
            disabled={!canEdit}
            onChange={(e) => {
              setName(e.target.value);
            }}
            className={inputClass}
          />
        </Field>
        <Field id={`c24-region-${site.id}`} label={t('org.sites.region')}>
          <select
            id={`c24-region-${site.id}`}
            value={region}
            disabled={!canEdit}
            onChange={(e) => {
              setRegion(e.target.value);
            }}
            className={inputClass}
          >
            <option value="">{t('org.noRegion')}</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        {canEdit ? <Button type="submit">{t('org.sites.rename')}</Button> : null}
        <NoticeLine notice={notice} />
      </form>
    </li>
  );
}

export function Settings() {
  const t = useT();
  const actor = useActor();
  const perms = usePermissions();
  const org = useOrganisation();
  const sites = useSites();
  const title = <PageHeader title={t('org.settings.title')} />;
  if (!perms.data)
    return (
      <>
        {title}
        <p>{t('shell.loading')}</p>
      </>
    );
  const target = { clientId: actor.clientId ?? '' };
  if (!can(perms.data, 'settings.view', target)) {
    return (
      <>
        {title}
        <p role="alert">{t('errors.forbidden')}</p>
      </>
    );
  }
  if (org.isError || sites.isError)
    return (
      <>
        {title}
        <p role="alert">{t('org.loadError')}</p>
      </>
    );
  if (!org.data || !sites.data)
    return (
      <>
        {title}
        <p>{t('shell.loading')}</p>
      </>
    );
  const canManage = can(perms.data, 'settings.manage', target);
  const canName = can(perms.data, 'org.editName', target);
  return (
    <>
      {title}
      <Section id="c24-org" title={t('org.title')}>
        <NameForm client={org.data} canEdit={canName} />
      </Section>
      <Section id="c24-settings" title={t('org.settings.heading')}>
        <SettingsForm client={org.data} canEdit={canManage} />
      </Section>
      <Section id="c24-sites" title={t('org.sites.title')}>
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {sites.data.map((s) => (
            <SiteRow key={`${s.id}-${s.name}-${s.region ?? ''}`} site={s} canEdit={canManage} />
          ))}
        </ul>
      </Section>
      <p>
        <a href="#/client/data" className={`inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`}>
          {t('dataPage.linkFrom')}
        </a>
      </p>
    </>
  );
}
