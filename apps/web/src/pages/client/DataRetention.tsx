// C22 Data and retention: retention settings, scheduled deletions, Export all data (ZIP) and the cancellation summary
// (brief 24.6, plan row C22). Exporting works in every account state until the account is deleted.
import { useState, type SyntheticEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, PageHeader } from '@sta/ui';
import { ValidationError } from '@sta/data';
import type { RetentionPolicy } from '@sta/data';
import { can, holdsAnywhere, type Client } from '@sta/domain';
import type { MessageKey } from '@sta/content';
import { useActor, useStore, useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { focusLink } from '../staff/styles';
import { ExportDialog } from './ExportDialog';
import { inputClass } from './foundationsErrors';
import { PermissionGate } from './PermissionGate';
import { usePermissions } from './queries';

const FIELDS: { key: keyof RetentionPolicy; label: MessageKey }[] = [
  { key: 'leaverRecordsMonths', label: 'dataPage.leaverRecords' },
  { key: 'notesAfterLeaveDays', label: 'dataPage.leaverNotes' },
  { key: 'eventDetailMonths', label: 'dataPage.eventDetail' },
  { key: 'feedbackMonths', label: 'dataPage.feedback' },
  { key: 'ticketMonthsAfterClose', label: 'dataPage.tickets' },
  { key: 'attachmentDaysAfterClose', label: 'dataPage.ticketFiles' },
  { key: 'trialDeleteDays', label: 'dataPage.trial' },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
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

function RetentionForm({ client, canEdit }: { client: Client; canEdit: boolean }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const stored = client.settings.retention;
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(FIELDS.map((f) => [f.key, String(stored[f.key])])),
  );
  const [notice, setNotice] = useState<{ role: 'status' | 'alert'; text: string } | null>(null);
  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    try {
      const patch = Object.fromEntries(FIELDS.map((f) => [f.key, Number(values[f.key])])) as Partial<RetentionPolicy>;
      await store.retention.update(actor, patch);
      setNotice({ role: 'status', text: t('dataPage.saved') });
      await queryClient.invalidateQueries();
    } catch (err) {
      setNotice({
        role: 'alert',
        text: err instanceof ValidationError ? t('dataPage.invalid') : t('dataPage.saveError'),
      });
    }
  };
  return (
    <form
      noValidate
      onSubmit={(e) => {
        void submit(e);
      }}
      className="flex flex-col gap-3"
    >
      {FIELDS.map((f) => (
        <div key={f.key} className="flex flex-col gap-1">
          <label htmlFor={`c22-${f.key}`} className="font-semibold">
            {t(f.label)}
          </label>
          <input
            id={`c22-${f.key}`}
            type="number"
            inputMode="numeric"
            value={values[f.key] ?? ''}
            readOnly={!canEdit}
            onChange={(e) => {
              setValues({ ...values, [f.key]: e.target.value });
            }}
            className={inputClass}
          />
        </div>
      ))}
      {notice ? (
        <p role={notice.role} className="m-0 font-semibold">
          {notice.text}
        </p>
      ) : null}
      {canEdit ? (
        <div>
          <Button type="submit">{t('dataPage.save')}</Button>
        </div>
      ) : null}
    </form>
  );
}

function Page() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const perms = usePermissions();
  const [exporting, setExporting] = useState(false);
  const [ready, setReady] = useState(false);
  const client = useQuery({
    queryKey: ['dataPage', 'client', actor.userId, actor.now],
    queryFn: () => store.clients.get(actor, actor.clientId ?? ''),
  });
  const schedule = useQuery({
    queryKey: ['dataPage', 'schedule', actor.userId, actor.now],
    queryFn: () => store.retention.schedule(actor),
  });
  if (client.isError || schedule.isError) return <p role="alert">{t('client.loadError')}</p>;
  if (!client.data || !schedule.data || !perms.data) return <p>{t('shell.loading')}</p>;
  const clientId = actor.clientId ?? '';
  const canEdit = can(perms.data, 'settings.manage', { clientId });
  const canExport = holdsAnywhere(perms.data, 'reports.export');

  return (
    <>
      <p className="mt-0">{t('dataPage.intro')}</p>
      <Section id="c22-retention" title={t('dataPage.settingsTitle')}>
        <p className="mt-0">{t('dataPage.settingsIntro')}</p>
        <RetentionForm client={client.data} canEdit={canEdit} />
      </Section>
      <Section id="c22-scheduled" title={t('dataPage.scheduledTitle')}>
        {schedule.data.length === 0 ? (
          <p className="m-0">{t('dataPage.scheduledNone')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {schedule.data.map((row) => (
              <li key={`${row.category}-${row.subjectId ?? ''}-${row.at}`}>
                {t('dataPage.scheduledLine', {
                  what: t(`dataPage.category.${row.category}` as MessageKey),
                  date: formatLondonDate(row.at),
                })}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section id="c22-export" title={t('dataPage.exportTitle')}>
        <p className="mt-0">{t('dataPage.exportIntro')}</p>
        {canExport ? (
          <Button
            onClick={() => {
              setReady(false);
              setExporting(true);
            }}
          >
            {t('dataPage.exportButton')}
          </Button>
        ) : null}
        {ready ? (
          <p role="status" className="mt-3 mb-0 font-semibold">
            {t('dataPage.ready')}
          </p>
        ) : null}
      </Section>
      <Section id="c22-cancel" title={t('dataPage.cancelTitle')}>
        <p className="mt-0">{t('dataPage.cancelExport')}</p>
        <p>{t('dataPage.cancelDelete')}</p>
        <a
          href="#/client/account-status"
          className={`inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`}
        >
          {t('dataPage.accountLink')}
        </a>
      </Section>
      <ExportDialog
        open={exporting}
        title={t('dataPage.confirmTitle')}
        fetchBundle={(code) => store.exports.clientData(actor, code)}
        nameFor={(name) => name}
        onClose={() => {
          setExporting(false);
        }}
        onDone={() => {
          setReady(true);
        }}
      />
    </>
  );
}

export function DataRetention() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('dataPage.title')} />
      <PermissionGate permission="settings.view" message="errors.forbidden">
        <Page />
      </PermissionGate>
    </>
  );
}
