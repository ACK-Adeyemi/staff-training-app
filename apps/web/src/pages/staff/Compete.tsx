// S10 Compete: live competitions with a details sheet, recently ended ones, and the standing boards.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, LeaderboardList, PageHeader, SegmentedControl } from '@sta/ui';
import {
  competitionStatus,
  londonDateString,
  type BoardId,
  type Competition,
  type LeaderboardScope,
  type SiteMeasure,
} from '@sta/domain';
import type { BoardPeriodId, BoardView } from '@sta/data';
import { useActor, useClock, useStore, useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { focusLink } from './styles';
import { CompetitionSheet, positionLine, toListRows } from '../compete/CompetitionSheet';
import { SitesBoardPanel } from '../compete/SitesBoardPanel';
import { useBoardSettings, useCompetitions, useScopes } from '../compete/queries';
import { BOARD_ORDER, boardTitle, scopeLabel, SITE_MEASURES, unitText } from '../compete/shared';

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
type Scopes = Record<BoardId, LeaderboardScope>;

/** All six boards load together, so the region appears once, complete. */
function useBoards(periods: Periods, scopes: Scopes) {
  const store = useStore();
  const actor = useActor();
  const day = londonDateString(useClock().now());
  return useQuery({
    queryKey: ['standingBoards', actor.userId, day, JSON.stringify(periods), JSON.stringify(scopes)],
    queryFn: async (): Promise<Record<BoardId, BoardView>> => {
      const views = await Promise.all(
        BOARD_ORDER.map((board) =>
          store.leaderboards.standing(actor, { board, period: periods[board], scope: scopes[board] }),
        ),
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
  scopes,
  scope,
  onScope,
}: {
  board: BoardId;
  view: BoardView;
  period: BoardPeriodId;
  onPeriod: (p: BoardPeriodId) => void;
  /** The scopes that apply to the viewer and are switched on for this board. One or none means no choice. */
  scopes: LeaderboardScope[];
  scope: LeaderboardScope;
  onScope: (s: LeaderboardScope) => void;
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
        {scopes.length > 1 ? (
          <div className="mt-3">
            <SegmentedControl
              legend={t('sitesBoard.scope')}
              options={scopes.map((s) => ({ value: s, label: scopeLabel(t, s) }))}
              value={scope}
              onChange={(v) => {
                onScope(v as LeaderboardScope);
              }}
            />
          </div>
        ) : null}
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

const SITE_SCOPE_ORDER: LeaderboardScope[] = ['site', 'region', 'country', 'all'];

/** Tabs for People and Sites boards. Roving focus with the arrow keys. */
function BoardTabs({ tab, onTab }: { tab: 'people' | 'sites'; onTab: (t: 'people' | 'sites') => void }) {
  const t = useT();
  const tabs = [
    { id: 'people', label: t('sitesBoard.tabPeople') },
    { id: 'sites', label: t('sitesBoard.tabSites') },
  ] as const;
  return (
    <div role="tablist" aria-label={t('sitesBoard.boardType')} className="mb-3 flex gap-2">
      {tabs.map((x) => (
        <button
          key={x.id}
          type="button"
          role="tab"
          id={`board-tab-${x.id}`}
          aria-selected={tab === x.id}
          aria-controls={`board-panel-${x.id}`}
          tabIndex={tab === x.id ? 0 : -1}
          onClick={() => {
            onTab(x.id);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const next = x.id === 'people' ? 'sites' : 'people';
            onTab(next);
            document.getElementById(`board-tab-${next}`)?.focus();
          }}
          className={`min-h-[var(--target-min)] min-w-[var(--target-min)] cursor-pointer rounded-[var(--radius-md)] border-2 border-[var(--color-border)] px-4 py-2 font-semibold ${focusLink} ${tab === x.id ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)] underline underline-offset-4' : 'bg-[var(--color-surface)]'}`}
        >
          {x.label}
        </button>
      ))}
    </div>
  );
}

function StandingBoards() {
  const t = useT();
  const [periods, setPeriods] = useState<Periods>(
    () => Object.fromEntries(BOARD_ORDER.map((b) => [b, defaultPeriod(b)])) as Periods,
  );
  const [scopes, setScopes] = useState<Scopes>(() => Object.fromEntries(BOARD_ORDER.map((b) => [b, 'site'])) as Scopes);
  const [tab, setTab] = useState<'people' | 'sites'>('people');
  const boards = useBoards(periods, scopes);
  const settings = useBoardSettings();
  const applies = useScopes();
  if (boards.isError) return <p role="alert">{t('compete.loadError')}</p>;
  if (!boards.data || !settings.data || !applies.data) return <p>{t('shell.loading')}</p>;
  const data = boards.data;
  const config = settings.data;
  const available = applies.data;
  const scopesFor = (b: BoardId): LeaderboardScope[] =>
    SITE_SCOPE_ORDER.filter(
      (s) => s === 'site' || (available.includes(s) && (config.boards[b]?.staffScopes ?? ['site']).includes(s)),
    );
  const siteScopes = SITE_SCOPE_ORDER.filter(
    (s) => s === 'site' || (available.includes(s) && config.siteBoard.staffScopes.includes(s)),
  );
  const siteMeasures = config.siteBoard.measures.filter((m) => (SITE_MEASURES as readonly string[]).includes(m));
  const showSites = config.siteBoard.enabled && available.includes('all') && siteMeasures.length > 0;
  const people = (
    <>
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
            scopes={scopesFor(b)}
            scope={scopes[b]}
            onScope={(s) => {
              setScopes({ ...scopes, [b]: s });
            }}
          />
        ),
      )}
    </>
  );
  return (
    <section aria-labelledby="standing-boards">
      <h2 id="standing-boards" className={h2}>
        {t('compete.boards')}
      </h2>
      {showSites ? (
        <>
          <BoardTabs tab={tab} onTab={setTab} />
          <div role="tabpanel" id={`board-panel-${tab}`} aria-labelledby={`board-tab-${tab}`}>
            {tab === 'people' ? (
              people
            ) : (
              <SitesBoardPanel measures={siteMeasures as SiteMeasure[]} scopes={siteScopes} />
            )}
          </div>
        </>
      ) : (
        people
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
