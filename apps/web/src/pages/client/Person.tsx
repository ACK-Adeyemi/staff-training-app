import { useState } from 'react';
import { useParams } from 'react-router';
import { Button, Card, Dialog, PageHeader, StatusBadge } from '@sta/ui';
import { can, personRequirementRows } from '@sta/domain';
import { useActor, useStore, useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { UploadForm } from '../evidence/UploadForm';
import { focusLink } from '../staff/styles';
import { fullName, useClientData, usePermissions } from './queries';

/** C3: one person's requirements and their status. Learner notes are never shown here. */
export function PersonRecord() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const { personId } = useParams();
  const q = useClientData();
  const perms = usePermissions();
  const [uploading, setUploading] = useState<string | null>(null);
  const [reminder, setReminder] = useState<{ role: 'status' | 'alert'; text: string } | null>(null);
  if (q.isError) return <p role="alert">{t('client.loadError')}</p>;
  if (!q.data) return <p>{t('shell.loading')}</p>;
  const { view } = q.data;
  const person = view.people.find((p) => p.id === personId);
  if (!person) {
    return (
      <>
        <PageHeader title={t('nav.client.people')} />
        <p role="alert">{t('client.person.notFound')}</p>
        <a
          href="#/client/people"
          className={`inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`}
        >
          {t('client.person.backToPeople')}
        </a>
      </>
    );
  }
  const rows = personRequirementRows(view, person);
  const site = view.sites.find((s) => s.id === person.primarySiteId);
  const target = { clientId: person.clientId, siteIds: [person.primarySiteId, ...person.additionalSiteIds] };
  const mayUpload = !!perms.data && can(perms.data, 'evidence.uploadForOthers', target);
  const mayRemind = !!perms.data && can(perms.data, 'reminders.manage', target);
  const uploadRow = rows.find((r) => r.requirement.id === uploading);
  const remind = async () => {
    try {
      const result = await store.reminders.send(actor, [person.id]);
      setReminder(
        result.sent.length > 0
          ? { role: 'status', text: t('evidenceFlow.reminderSent') }
          : { role: 'alert', text: t('evidenceFlow.reminderNone', { name: fullName(person) }) },
      );
    } catch {
      setReminder({ role: 'alert', text: t('evidenceFlow.reminderError') });
    }
  };
  const days = (n: number, one: 'client.person.daysLeftOne', many: 'client.person.daysLeft') =>
    n === 1 ? t(one) : t(many, { count: n });

  return (
    <>
      <PageHeader title={fullName(person)} />
      {site ? <p className="mt-0">{t('client.person.site', { site: site.name })}</p> : null}
      {mayRemind ? (
        <div className="mb-4">
          <Button variant="secondary" onClick={() => void remind()}>
            {t('evidenceFlow.sendReminder')}
          </Button>
          {reminder ? <p role={reminder.role}>{reminder.text}</p> : null}
        </div>
      ) : null}
      <section aria-labelledby="c3-reqs">
        <h2 id="c3-reqs" className="mb-3 text-lg font-bold">
          {t('client.person.requirements')}
        </h2>
        {rows.length === 0 ? <p>{t('client.person.noRequirements')}</p> : null}
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {rows.map((r) => (
            <li key={r.requirement.id}>
              <Card className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{r.requirement.name}</span>
                <span className="flex flex-wrap items-center gap-2">
                  {r.status === 'expiringSoon' && r.daysLeft !== undefined ? (
                    <span className="text-sm">
                      {days(r.daysLeft, 'client.person.daysLeftOne', 'client.person.daysLeft')}
                    </span>
                  ) : null}
                  {r.status === 'overdue' && r.daysLeft !== undefined ? (
                    <span className="text-sm">
                      {Math.abs(r.daysLeft) === 1
                        ? t('client.person.overdueByOne')
                        : t('client.person.overdueBy', { count: Math.abs(r.daysLeft) })}
                    </span>
                  ) : null}
                  {r.expiresAt && r.status !== 'overdue' ? (
                    <span className="text-sm">
                      {t('client.person.expires', { date: formatLondonDate(r.expiresAt) })}
                    </span>
                  ) : null}
                  <StatusBadge status={r.status} label={t(`client.status.${r.status}`)} />
                  {mayUpload && r.requirement.acceptsExternal ? (
                    <Button
                      variant="secondary"
                      aria-label={t('evidenceFlow.uploadLink', { requirement: r.requirement.name })}
                      onClick={() => {
                        setUploading(r.requirement.id);
                      }}
                    >
                      {t('evidenceFlow.uploadTitle')}
                    </Button>
                  ) : null}
                </span>
              </Card>
            </li>
          ))}
        </ul>
      </section>
      <Dialog
        open={uploadRow !== undefined}
        title={t('evidenceFlow.uploadFor', { name: fullName(person) })}
        onClose={() => {
          setUploading(null);
        }}
      >
        {uploadRow ? (
          <div className="flex flex-col gap-4">
            <p className="m-0 font-semibold">{uploadRow.requirement.name}</p>
            <UploadForm
              requirement={uploadRow.requirement}
              personId={person.id}
              siteId={person.primarySiteId}
              onBehalf
            />
            <div>
              <Button
                variant="secondary"
                onClick={() => {
                  setUploading(null);
                }}
              >
                {t('evidenceFlow.cancel')}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
