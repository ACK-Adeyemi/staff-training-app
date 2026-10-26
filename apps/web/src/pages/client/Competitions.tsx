// C11 Competitions: live, scheduled, ended and draft, with a status word and icon on each row.
import { Card, LinkButton, PageHeader } from '@sta/ui';
import { can, competitionStatus, type Competition, type CompetitionStatus } from '@sta/domain';
import { useActor, useClock, useT } from '../../app/hooks';
import { useCompetitions } from '../compete/queries';
import { StatusWord, dateRange } from '../compete/shared';
import { focusLink } from '../staff/styles';
import { usePermissions } from './queries';

const GROUPS: { id: 'live' | 'scheduled' | 'ended' | 'draft'; statuses: CompetitionStatus[] }[] = [
  { id: 'live', statuses: ['live'] },
  { id: 'scheduled', statuses: ['scheduled'] },
  { id: 'ended', statuses: ['ended', 'cancelled'] },
  { id: 'draft', statuses: ['draft'] },
];

function Group({
  id,
  statuses,
  competitions,
}: {
  id: (typeof GROUPS)[number]['id'];
  statuses: CompetitionStatus[];
  competitions: Competition[];
}) {
  const t = useT();
  const now = useClock().now();
  const items = competitions.filter((c) => statuses.includes(competitionStatus(c, now)));
  return (
    <section aria-labelledby={`group-${id}`} className="mb-4">
      <h2 id={`group-${id}`} className="mb-2 mt-4 text-xl font-bold">
        {t(`competition.groups.${id}`)}
      </h2>
      {items.length === 0 ? (
        <p className="m-0">{t('competition.none')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((c) => (
            <li key={c.id} data-testid="competition-row">
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <a href={`#/client/competitions/${c.id}`} className={`text-lg font-bold underline ${focusLink}`}>
                    {c.name}
                  </a>
                  <StatusWord status={competitionStatus(c, now)} t={t} />
                </div>
                <p className="mb-0 mt-1 text-sm">{dateRange(t, c)}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Competitions() {
  const t = useT();
  const actor = useActor();
  const perms = usePermissions();
  const comps = useCompetitions();
  if (!perms.data) return <p>{t('shell.loading')}</p>;
  const target = actor.clientId ? { clientId: actor.clientId } : undefined;
  if (!target || !can(perms.data, 'competitions.view', target, 'read')) {
    return (
      <>
        <PageHeader title={t('competition.title')} />
        <p role="alert">{t('competition.noAccess')}</p>
      </>
    );
  }
  const canManage = can(perms.data, 'competitions.manage', target, 'write');
  return (
    <>
      <PageHeader title={t('competition.title')}>
        <div className="flex flex-wrap gap-2">
          {canManage ? <LinkButton href="#/client/competitions/new">{t('competition.newLink')}</LinkButton> : null}
          <LinkButton variant="secondary" href="#/client/leaderboards">
            {t('competition.settingsLink')}
          </LinkButton>
        </div>
      </PageHeader>
      {comps.isError ? <p role="alert">{t('competition.loadError')}</p> : null}
      {comps.data ? (
        GROUPS.map((g) => <Group key={g.id} {...g} competitions={comps.data} />)
      ) : (
        <p>{t('shell.loading')}</p>
      )}
    </>
  );
}
