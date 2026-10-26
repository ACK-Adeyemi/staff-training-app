// The competition details sheet shared by S10 and the S2 banners: how to win, prize, dates, leaderboard and winners.
import { useEffect, useState } from 'react';
import { Button, LeaderboardList, Sheet } from '@sta/ui';
import { competitionStatus, type Competition } from '@sta/domain';
import type { StandingsRow, StandingsView } from '@sta/data';
import { useClock, useT } from '../../app/hooks';
import { dateRange, ordinalText, templateText, unitText } from './shared';
import { useStandings } from './queries';

export function toListRows(rows: readonly StandingsRow[], valueText: (n: number) => string) {
  return rows.map((r, i) => ({
    id: `${String(r.rank)}-${String(i)}`,
    rank: r.rank,
    tied: rows.filter((x) => x.rank === r.rank).length > 1,
    name: r.name,
    valueText: valueText(r.value),
    isViewer: r.isViewer === true,
  }));
}

/** "You're 2nd of 13" or the private variant, or how to join. Null when there is nothing to say. */
export function positionLine(
  t: ReturnType<typeof useT>,
  viewer: StandingsView['viewer'] | undefined,
): { text: string; private: boolean } | null {
  if (!viewer) return null;
  if (viewer.rank === null) return { text: t('compete.notOnBoard'), private: false };
  const params = { ordinal: ordinalText(t, viewer.rank), of: viewer.of };
  return viewer.hidden
    ? { text: t('compete.positionPrivate', params), private: true }
    : { text: t('compete.position', params), private: false };
}

function Body({ competition, onClose }: { competition: Competition; onClose: () => void }) {
  const t = useT();
  const now = useClock().now();
  const standings = useStandings(competition.id);
  const status = competitionStatus(competition, now);
  const view = standings.data;
  const rowsShown = view?.visible === true && (competition.liveLeaderboard !== false || status === 'ended');
  const position = positionLine(t, view?.viewer);
  return (
    <div className="flex flex-col gap-4">
      {competition.description ? <p className="m-0">{competition.description}</p> : null}
      <dl className="m-0 grid gap-2">
        <div>
          <dt className="font-semibold">{t('competition.prize')}</dt>
          <dd className="m-0">{competition.prizeText}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t('compete.datesLabel')}</dt>
          <dd className="m-0">{dateRange(t, competition)}</dd>
        </div>
      </dl>
      {view?.eligible === false ? (
        <p role="note" className="m-0 font-semibold">
          {t('compete.notEligible')}
        </p>
      ) : null}
      {competition.type === 'builtIn' && competition.templateId ? (
        <section aria-labelledby={`how-${competition.id}`}>
          <h3 id={`how-${competition.id}`} className="mb-1 mt-0 text-lg font-bold">
            {t('competition.howToWin')}
          </h3>
          <p className="m-0">{templateText(t, competition.templateId, 'howToWin')}</p>
        </section>
      ) : null}
      {view?.visible ? (
        <section aria-labelledby={`lb-${competition.id}`}>
          <h3 id={`lb-${competition.id}`} className="mb-2 mt-0 text-lg font-bold">
            {t('leaderboard.title')}
          </h3>
          {rowsShown && (view.rows?.length ?? 0) > 0 ? (
            <LeaderboardList
              label={t('leaderboard.title')}
              rows={toListRows(view.rows ?? [], (n) =>
                unitText(t, competition.templateId === 'teamShowdown' ? 'teamBoard' : 'competition', n),
              )}
              jointLabel={t('compete.joint')}
              youLabel={t('leaderboard.you')}
              rowTestId="standing-row"
            />
          ) : (
            <p className="m-0">{rowsShown ? t('compete.noRows') : t('compete.leaderboardLater')}</p>
          )}
          {position ? <p className="mb-0 mt-2 font-semibold">{position.text}</p> : null}
        </section>
      ) : null}
      {view?.winners ? (
        <section aria-labelledby={`win-${competition.id}`}>
          <h3 id={`win-${competition.id}`} className="mb-2 mt-0 text-lg font-bold">
            {t('compete.winners')}
          </h3>
          <ul className="m-0 list-none p-0">
            {view.winners.map((w, i) => (
              <li key={i} className="min-h-[var(--target-min)] py-1 font-semibold">
                {w.hidden || !w.name ? t('compete.winnerHidden') : w.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div>
        <Button variant="secondary" onClick={onClose}>
          {t('compete.closeSheet')}
        </Button>
      </div>
    </div>
  );
}

/** Mounted only while open, so a closed sheet adds nothing to the page; focus goes back to what opened it. */
export function CompetitionSheet({
  competition,
  open,
  onClose,
}: {
  competition: Competition;
  open: boolean;
  onClose: () => void;
}) {
  return open ? <OpenSheet competition={competition} onClose={onClose} /> : null;
}

function OpenSheet({ competition, onClose }: { competition: Competition; onClose: () => void }) {
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  useEffect(
    () => () => {
      opener?.focus();
    },
    [opener],
  );
  return (
    <Sheet open title={competition.name} onClose={onClose}>
      <Body competition={competition} onClose={onClose} />
    </Sheet>
  );
}
