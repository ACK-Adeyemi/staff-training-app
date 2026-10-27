// S10: the Sites board tab. Sites are compared by percentages, never by who was quickest, and never show people.
import { useState } from 'react';
import { SegmentedControl } from '@sta/ui';
import type { LeaderboardScope, SiteBoardPeriod, SiteMeasure } from '@sta/domain';
import { useT } from '../../app/hooks';
import { useSitesBoard } from './queries';
import { measureLabel, ordinalText, scopeLabel, siteValueText } from './shared';

export function SitesBoardPanel({
  measures,
  scopes,
}: {
  measures: SiteMeasure[];
  /** Scopes that apply to the viewer and are switched on for the Sites board, My site first. */
  scopes: LeaderboardScope[];
}) {
  const t = useT();
  const [measure, setMeasure] = useState<SiteMeasure>(measures[0] ?? 'participation');
  const [period, setPeriod] = useState<SiteBoardPeriod>('thisMonth');
  const [scope, setScope] = useState<LeaderboardScope>('site');
  const board = useSitesBoard({ measure, period, scope });
  const view = board.data;
  const own = view?.own ?? null;
  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        legend={t('sitesBoard.measure')}
        options={measures.map((m) => ({ value: m, label: measureLabel(t, m) }))}
        value={measure}
        onChange={(v) => {
          setMeasure(v as SiteMeasure);
        }}
      />
      <SegmentedControl
        legend={t('sitesBoard.period')}
        options={(['thisMonth', 'thisQuarter'] as const).map((p) => ({ value: p, label: t(`compete.periods.${p}`) }))}
        value={period}
        onChange={(v) => {
          setPeriod(v === 'thisQuarter' ? 'thisQuarter' : 'thisMonth');
        }}
      />
      {scopes.length > 1 ? (
        <SegmentedControl
          legend={t('sitesBoard.scope')}
          options={scopes.map((s) => ({ value: s, label: scopeLabel(t, s) }))}
          value={scope}
          onChange={(v) => {
            setScope(v as LeaderboardScope);
          }}
        />
      ) : null}
      <p className="m-0">{t('sitesBoard.fairNote')}</p>
      {board.isError ? <p role="alert">{t('sitesBoard.loadError')}</p> : null}
      {view ? (
        <>
          <ol aria-label={t('sitesBoard.title')} className="m-0 flex list-none flex-col gap-2 p-0">
            {view.rows.map((r) => (
              <li
                key={r.siteId}
                data-testid="site-board-row"
                aria-current={r.isViewer ? 'true' : undefined}
                className={`flex min-h-[var(--target-min)] flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-md)] bg-[var(--color-surface)] px-3 py-2 ${r.isViewer ? 'border-4 border-[var(--color-accent)]' : 'border-2 border-[var(--color-border)]'}`}
              >
                <span className="min-w-12 font-bold">{ordinalText(t, r.rank)}</span>
                <span className="flex-1 font-semibold">{r.siteName}</span>
                {r.isViewer ? <span className="font-bold">{t('leaderboard.you')}</span> : null}
                {r.small ? <span className="text-sm font-semibold">{t('leaderboard.smallSite')}</span> : null}
                <span>{siteValueText(measure, r.value)}</span>
              </li>
            ))}
          </ol>
          {view.toNext && own ? (
            <p data-testid="to-next" className="m-0 font-semibold">
              {view.toNext.people === 1
                ? t('sitesBoard.toNextOne', { name: own.siteName })
                : t('sitesBoard.toNext', { count: view.toNext.people, name: own.siteName })}
            </p>
          ) : null}
        </>
      ) : board.isError ? null : (
        <p>{t('shell.loading')}</p>
      )}
    </div>
  );
}
