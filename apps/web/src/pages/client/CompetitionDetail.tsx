// C13 Competition detail: leaderboard (admins always see it), extend, cancel, record winners.
import { useState } from 'react';
import { useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Dialog, LeaderboardList, LinkButton, PageHeader } from '@sta/ui';
import { can, competitionStatus, londonDateString, type Competition } from '@sta/domain';
import type { StandingsView } from '@sta/data';
import { useActor, useClock, useStore, useT } from '../../app/hooks';
import { toListRows } from '../compete/CompetitionSheet';
import { competitionErrorKey } from '../compete/errors';
import { useCompetition, useStandings } from '../compete/queries';
import { StatusWord, dateRange, londonDayEnd, templateText, unitText } from '../compete/shared';
import { field } from './organiseShared';
import { usePermissions } from './queries';

type Dlg = 'extend' | 'cancel' | null;

function Actions({ competition, canManage }: { competition: Competition; canManage: boolean }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const now = useClock().now();
  const queryClient = useQueryClient();
  const [dlg, setDlg] = useState<Dlg>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newEnd, setNewEnd] = useState(londonDateString(new Date(competition.endAt)));
  const status = competitionStatus(competition, now);
  if (!canManage) return null;

  const run = async (work: () => Promise<unknown>, done?: () => void) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
      done?.();
      await queryClient.invalidateQueries();
    } catch (e) {
      setProblem(t(competitionErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };
  const open = status === 'live' || status === 'scheduled' || status === 'draft';
  const canRecord =
    status === 'ended' &&
    competition.type === 'builtIn' &&
    competition.winners === undefined &&
    competition.status !== 'cancelled';
  const close = () => {
    setDlg(null);
    setProblem(null);
  };
  return (
    <div className="my-4 flex flex-wrap gap-3">
      {status === 'draft' || status === 'scheduled' ? (
        <LinkButton variant="secondary" href={`#/client/competitions/${competition.id}/edit`}>
          {t('competition.edit')}
        </LinkButton>
      ) : null}
      {open ? (
        <Button
          variant="secondary"
          onClick={() => {
            setDlg('extend');
          }}
        >
          {t('competition.extend')}
        </Button>
      ) : null}
      {open ? (
        <Button
          variant="secondary"
          onClick={() => {
            setDlg('cancel');
          }}
        >
          {t('competition.cancelAction')}
        </Button>
      ) : null}
      {canRecord ? (
        <Button
          disabled={busy}
          onClick={() => {
            void run(() => store.competitions.recordWinners(actor, competition.id));
          }}
        >
          {t('competition.recordWinners')}
        </Button>
      ) : null}
      {problem && dlg === null ? (
        <p role="alert" className="m-0 w-full font-semibold">
          {problem}
        </p>
      ) : null}
      <Dialog open={dlg === 'extend'} title={t('competition.extend')} onClose={close}>
        {dlg === 'extend' ? (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 font-semibold">
              {t('competition.newEnd')}
              <input
                type="date"
                value={newEnd}
                className={field}
                onChange={(e) => {
                  setNewEnd(e.target.value);
                }}
              />
            </label>
            {problem ? (
              <p role="alert" className="m-0 font-semibold">
                {problem}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busy}
                onClick={() => {
                  const endAt = londonDayEnd(newEnd);
                  if (!endAt) {
                    setProblem(t('errors.validation'));
                    return;
                  }
                  void run(() => store.competitions.extend(actor, competition.id, endAt), close);
                }}
              >
                {t('competition.extendSave')}
              </Button>
              <Button variant="secondary" onClick={close}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
      <Dialog open={dlg === 'cancel'} title={t('competition.cancelTitle')} onClose={close}>
        {dlg === 'cancel' ? (
          <div className="flex flex-col gap-3">
            <p className="m-0">{t('competition.cancelBody')}</p>
            {problem ? (
              <p role="alert" className="m-0 font-semibold">
                {problem}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busy}
                onClick={() => {
                  void run(() => store.competitions.cancel(actor, competition.id), close);
                }}
              >
                {t('competition.cancelYes')}
              </Button>
              <Button variant="secondary" onClick={close}>
                {t('competition.cancelNo')}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function Standings({ competition, view }: { competition: Competition; view: StandingsView | undefined }) {
  const t = useT();
  if (competition.type === 'custom' || !view) return <p>{t('competition.noLeaderboard')}</p>;
  const rows = view.rows ?? [];
  return (
    <>
      <section aria-labelledby="c13-lb" className="mb-4">
        <h2 id="c13-lb" className="mb-2 mt-4 text-xl font-bold">
          {t('leaderboard.title')}
        </h2>
        {competition.liveLeaderboard === false ? <p className="mt-0">{t('competition.leaderboardOff')}</p> : null}
        {rows.length > 0 ? (
          <LeaderboardList
            label={t('leaderboard.title')}
            rows={toListRows(rows, (n) =>
              unitText(t, competition.templateId === 'teamShowdown' ? 'teamBoard' : 'competition', n),
            )}
            jointLabel={t('compete.joint')}
            youLabel={t('leaderboard.you')}
            rowTestId="standing-row"
          />
        ) : (
          <p className="m-0">{t('compete.noRows')}</p>
        )}
      </section>
      {view.winners ? (
        <section aria-labelledby="c13-win" className="mb-4">
          <h2 id="c13-win" className="mb-2 mt-4 text-xl font-bold">
            {t('competition.winners')}
          </h2>
          {view.winners.length === 0 ? (
            <p className="m-0">{t('competition.noWinners')}</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {view.winners.map((w, i) => (
                <li key={i} className="min-h-[var(--target-min)] py-1 font-semibold">
                  {w.name ?? t('compete.winnerHidden')}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
}

export function CompetitionDetail() {
  const t = useT();
  const actor = useActor();
  const now = useClock().now();
  const { id = '' } = useParams();
  const perms = usePermissions();
  const comp = useCompetition(id);
  const standings = useStandings(id, comp.data?.type === 'builtIn');
  if (!perms.data) return <p>{t('shell.loading')}</p>;
  const target = actor.clientId ? { clientId: actor.clientId } : undefined;
  if (!target || !can(perms.data, 'competitions.view', target, 'read')) {
    return <p role="alert">{t('competition.noAccess')}</p>;
  }
  if (comp.isError) return <p role="alert">{t('competition.notFound')}</p>;
  if (!comp.data || (comp.data.type === 'builtIn' && !standings.data)) return <p>{t('shell.loading')}</p>;
  const c = comp.data;
  const canManage = can(perms.data, 'competitions.manage', target, 'write');
  return (
    <>
      <PageHeader title={c.name}>
        <StatusWord status={competitionStatus(c, now)} t={t} />
      </PageHeader>
      <Card>
        {c.description ? <p className="mt-0">{c.description}</p> : null}
        <p className="m-0">
          <span className="font-semibold">{t('competition.prize')}:</span> {c.prizeText}
        </p>
        <p className="m-0">{dateRange(t, c)}</p>
        {c.type === 'builtIn' && c.templateId ? (
          <p className="mb-0 mt-2">
            <span className="font-semibold">{t('competition.howToWin')}:</span>{' '}
            {templateText(t, c.templateId, 'howToWin')}
          </p>
        ) : null}
      </Card>
      <Actions competition={c} canManage={canManage} />
      <Standings competition={c} view={standings.data} />
    </>
  );
}
