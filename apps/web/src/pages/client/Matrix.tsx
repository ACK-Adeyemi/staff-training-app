import { useQuery } from '@tanstack/react-query';
import { Button, DataTable, Icon, PageHeader, StatusBadge, type DataTableRow } from '@sta/ui';
import { can, matrixCsv, trainingMatrix, type MatrixCell, type RequirementStatusName } from '@sta/domain';
import type { MessageKey } from '@sta/content';
import { useActor, useClock, useStore, useT } from '../../app/hooks';
import { useSiteScope } from '../../app/siteScope';
import { formatLondonDate, formatLondonDateTime } from '../../demo/format';
import { focusLink } from '../staff/styles';
import { PermissionGate } from './PermissionGate';
import { fullName, useClientData, usePermissions } from './queries';

const WORDS: RequirementStatusName[] = [
  'current',
  'expiringSoon',
  'overdue',
  'notStarted',
  'awaitingCheck',
  'notAssigned',
];

function useClientName() {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: ['clientName', actor.clientId],
    queryFn: async () => (actor.clientId ? (await store.clients.get(actor, actor.clientId)).displayName : ''),
  });
}

function useTeams() {
  const store = useStore();
  const actor = useActor();
  return useQuery({ queryKey: ['teams', actor.userId], queryFn: () => store.teams.list(actor) });
}

function MatrixBody() {
  const t = useT();
  const actor = useActor();
  const clock = useClock();
  const data = useClientData();
  const teams = useTeams();
  const clientName = useClientName();
  const perms = usePermissions();
  const site = useSiteScope();
  if (data.isError || teams.isError || clientName.isError) return <p role="alert">{t('client.loadError')}</p>;
  if (!data.data || !teams.data || clientName.data === undefined) return <p>{t('shell.loading')}</p>;
  const { view } = data.data;
  const matrix = trainingMatrix({
    people: site === 'all' ? view.people : view.people.filter((p) => p.primarySiteId === site),
    requirements: view.requirements,
    evidence: view.evidence,
    submissions: view.submissions,
    teams: teams.data,
    sites: view.sites,
    now: view.now,
    amberWindowDays: view.amberWindowDays,
  });
  const canExport =
    actor.clientId !== undefined && can(perms.data ?? [], 'reports.export', { clientId: actor.clientId });

  const word = (s: RequirementStatusName) => t(`status.${s}`);
  const cell = (c: MatrixCell) => (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <StatusBadge status={c.status} label={word(c.status)} />
      {c.date ? <span className="text-sm">{formatLondonDate(c.date)}</span> : null}
    </span>
  );

  const columns = [
    { key: 'name', header: t('client.reports.matrix.name') },
    ...matrix.columns.map((c) => ({ key: c.id, header: c.name })),
  ];
  const rows: DataTableRow[] = matrix.groups.flatMap((g, gi) => [
    ...(g.team ? [{ id: `team-${String(gi)}`, cells: {}, heading: g.team.name }] : []),
    ...g.rows.map((r) => ({
      id: r.person.id,
      cells: {
        name: fullName(r.person),
        ...Object.fromEntries(matrix.columns.map((c, i) => [c.id, r.cells[i] ? cell(r.cells[i]) : null])),
      },
    })),
  ]);

  const download = () => {
    const csv = matrixCsv(matrix, (key) => t(key as MessageKey));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = t('client.reports.matrix.fileName');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="matrix-page">
      <div className="print:hidden">
        <a
          href="#/client/reports"
          className={`inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`}
        >
          {t('client.reports.matrix.back')}
        </a>
      </div>
      <PageHeader title={t('client.reports.matrix.title')}>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button
            variant="secondary"
            onClick={() => {
              window.print();
            }}
          >
            {t('client.reports.matrix.print')}
          </Button>
          {canExport ? (
            <Button variant="secondary" onClick={download}>
              {t('client.reports.matrix.download')}
            </Button>
          ) : null}
        </div>
      </PageHeader>
      <div className="mb-3">
        <p className="m-0 text-lg font-bold">{clientName.data}</p>
        <p className="m-0 font-semibold">{t('client.reports.matrix.auditTerm')}</p>
        <p className="m-0">
          {t('client.reports.matrix.generated', { when: formatLondonDateTime(clock.now().toISOString()) })}
        </p>
        <p className="m-0 flex items-center gap-1 font-semibold">
          <Icon name="alert" size={16} />
          <span>{t('client.reports.matrix.personalData')}</span>
        </p>
      </div>
      <section aria-labelledby="matrix-key" className="mb-4">
        <h2 id="matrix-key" className="mt-0 mb-1 text-base font-bold">
          {t('client.reports.matrix.keyTitle')}
        </h2>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {WORDS.map((s) => (
            <li key={s}>
              <StatusBadge status={s} label={word(s)} />
            </li>
          ))}
        </ul>
      </section>
      <DataTable
        caption={t('client.reports.matrix.caption', { client: clientName.data })}
        columns={columns}
        rows={rows}
        rowHeader
        stickyFirstColumn
        printFriendly
      />
    </div>
  );
}

/** C15: the training matrix, for the screen, for print and for CSV. */
export function Matrix() {
  return (
    <PermissionGate permission="reports.view" anyScope message="client.reports.noPermission">
      <MatrixBody />
    </PermissionGate>
  );
}
