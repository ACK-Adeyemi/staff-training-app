import { useParams } from 'react-router';
import { Card, PageHeader, StatusBadge } from '@sta/ui';
import { personRequirementRows } from '@sta/domain';
import { useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { focusLink } from '../staff/styles';
import { fullName, useClientData } from './queries';

/** C3: one person's requirements and their status. Learner notes are never shown here. */
export function PersonRecord() {
  const t = useT();
  const { personId } = useParams();
  const q = useClientData();
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
  const days = (n: number, one: 'client.person.daysLeftOne', many: 'client.person.daysLeft') =>
    n === 1 ? t(one) : t(many, { count: n });

  return (
    <>
      <PageHeader title={fullName(person)} />
      {site ? <p className="mt-0">{t('client.person.site', { site: site.name })}</p> : null}
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
                </span>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
