// S10 Compete: live competitions with a details sheet, recently ended ones, and the standing boards.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, LeaderboardList, PageHeader, SegmentedControl } from '@sta/ui';
import { competitionStatus, londonDateString, type BoardId, type Competition } from '@sta/domain';
import type { BoardPeriodId, BoardView } from '@sta/data';
import { useActor, useClock, useStore, useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { CompetitionSheet, positionLine, toListRows } from '../compete/CompetitionSheet';
import { useCompetitions } from '../compete/queries';
import { BOARD_ORDER, boardTitle, unitText } from '../compete/shared';

const h2 = 'mb-2 mt-6 text-xl font-bold';

function CompetitionCard({ competition }: { competition: Competition }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <li data-testid="competition-card">
      <Card>
        <p className="m-0 text-lg font-bold">{competition.name}</p>
        <p className="m-0">
          {t('competition.prize')}: {competition.prizeText}
        </p>
        <p className="mb-2 mt-0 text-sm">{t('compete.endsOn', { date: formatLondonDate(competition.endAt) })}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setOpen(true);
          }}
        >
          {t('compete.details', { name: competition.name })}
        </Button>
        <CompetitionSheet
          competition={competition}
          open={open}
          onClose={() => {
            setOpen(false);
          }}
        />
      </Card>
    </li>
  );
}

function CardList({ title, id, items, empty }: { title: string; id: string; items: Competition[]; empty: string }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={h2}>
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="m-0">{empty}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {items.map((c) => (
            <CompetitionCard key={c.id} competition={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

const defaultPeriod = (b: BoardId): BoardPeriodId => (b === 'teamBoard' ? 'thisMonth' : 'allTime');
const periodsFor = (b: BoardId): BoardPeriodId[] =>
  b === 'teamBoard' ? ['thisMonth', 'thisQuarter'] : ['allTime', 'thisMonth'];

type Periods = Record<BoardId, BoardPeriodId>;

/** All six boards load together, so the region appears once, complete. */
function useBoards(periods: Periods) {
  const store = useStore();
  const actor = useActor();
  const day = londonDateString(useClock().now());
  return useQuery({
    queryKey: ['standingBoards', actor.userId, day, JSON.stringify(periods)],
    queryFn: async (): Promise<Record<BoardId, BoardView>> => {
      const views = await Promise.all(
        BOARD_ORDER.map((board) => store.leaderboards.standing(actor, { board, period: periods[board] })),
      );
      return Object.fromEntries(BOARD_ORDER.map((b, i) => [b, views[i]])) as Record<BoardId, BoardView>;
    },
    placeholderData: (previous) => previous,
  });
}

function BoardSection({
  board,
  view,
  period,
  onPeriod,
}: {
  board: BoardId;
  view: BoardView;
  period: BoardPeriodId;
  onPeriod: (p: BoardPeriodId) => void;
}) {
  const t = useT();
  const title = boardTitle(t, board);
  const position = positionLine(t, view.viewer);
  const rows = view.rows ?? [];
  const id = `board-${board}`;
  return (
    <section aria-labelledby={id} className="mb-4">
      <Card>
        <h3 id={id} className="mb-2 mt-0 text-lg font-bold">
          {title}
        </h3>
        <SegmentedControl
          legend={t('compete.period')}
          options={periodsFor(board).map((p) => ({ value: p, label: t(`compete.periods.${p}`) }))}
          value={period}
          onChange={(v) => {
            onPeriod(v as BoardPeriodId);
          }}
        />
        <div className="mt-3">
          {rows.length > 0 ? (
            <LeaderboardList
              label={title}
              rows={toListRows(rows, (n) => unitText(t, board, n))}
              jointLabel={t('compete.joint')}
              youLabel={t('leaderboard.you')}
              rowTestId="board-row"
            />
          ) : (
            <p className="m-0">{t('compete.noRows')}</p>
          )}
          {position ? <p className="mb-0 mt-2 font-semibold">{position.text}</p> : null}
          {board === 'teamBoard' && (view.unranked?.length ?? 0) > 0 ? (
            <p className="mb-0 mt-2">{t('compete.noTraining', { names: (view.unranked ?? []).join(', ') })}</p>
          ) : null}
        </div>
      </Card>
    </section>
  );
}

function StandingBoards() {
  const t = useT();
  const [periods, setPeriods] = useState<Periods>(
    () => Object.fromEntries(BOARD_ORDER.map((b) => [b, defaultPeriod(b)])) as Periods,
  );
  const boards = useBoards(periods);
  if (boards.isError) return <p role="alert">{t('compete.loadError')}</p>;
  if (!boards.data) return <p>{t('shell.loading')}</p>;
  const data = boards.data;
  return (
    <section aria-labelledby="standing-boards">
      <h2 id="standing-boards" className={h2}>
        {t('compete.boards')}
      </h2>
      <p className="mt-0">{t('compete.boardsIntro')}</p>
      {BOARD_ORDER.map((b) =>
        data[b].off === true || !data[b].visible ? null : (
          <BoardSection
            key={b}
            board={b}
            view={data[b]}
            period={periods[b]}
            onPeriod={(p) => {
              setPeriods({ ...periods, [b]: p });
            }}
          />
        ),
      )}
    </section>
  );
}

export function Compete() {
  const t = useT();
  const now = useClock().now();
  const comps = useCompetitions();
  const status = (c: Competition) => competitionStatus(c, now);
  const all = comps.data ?? [];
  const live = all.filter((c) => status(c) === 'live');
  const ended = all
    .filter((c) => status(c) === 'ended')
    .sort((a, b) => b.endAt.localeCompare(a.endAt))
    .slice(0, 5);
  return (
    <>
      <PageHeader title={t('compete.title')} />
      {comps.isError ? <p role="alert">{t('compete.loadError')}</p> : null}
      {comps.data ? (
        <>
          <CardList id="live-comps" title={t('compete.live')} items={live} empty={t('compete.empty')} />
          <CardList id="ended-comps" title={t('compete.ended')} items={ended} empty={t('compete.noEnded')} />
        </>
      ) : comps.isError ? null : (
        <p>{t('shell.loading')}</p>
      )}
      <StandingBoards />
      <div className="mt-6">
        <Button disabled aria-describedby="battle-later">
          {t('compete.battleRoom')}
        </Button>
        <p id="battle-later" className="mt-1">
          {t('compete.battleLater')}
        </p>
      </div>
    </>
  );
}
