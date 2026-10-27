// C14 for a client with more than one site: staff scopes per board, the Sites board settings and the full ranking.
import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, SegmentedControl, Switch } from '@sta/ui';
import type { SitesBoardRow } from '@sta/data';
import {
  availableScopes,
  type LeaderboardScope,
  type Site,
  type SiteBoardPeriod,
  type SiteMeasure,
  type StandingBoardSettings,
} from '@sta/domain';
import { useActor, useStore, useT } from '../../app/hooks';
import { competitionErrorKey } from '../compete/errors';
import { useSitesBoard } from '../compete/queries';
import { measureLabel, ordinalText, scopeLabel, SITE_MEASURES, siteValueText } from '../compete/shared';

const ORDER: LeaderboardScope[] = ['site', 'region', 'country', 'all'];

/** Saves the whole settings record, reporting a problem in words rather than an error. */
export function useSaveSettings(settings: StandingBoardSettings) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const save = async (next: StandingBoardSettings): Promise<boolean> => {
    setBusy(true);
    setProblem(null);
    try {
      await store.leaderboards.saveSettings(actor, next);
      await queryClient.invalidateQueries();
      return true;
    } catch (e) {
      setProblem(t(competitionErrorKey(e)));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { save, busy, problem, settings };
}

/** The scopes that apply to this organisation, in order. My site is always there. */
export const applicableScopes = (sites: Site[]): LeaderboardScope[] =>
  ORDER.filter((s) => availableScopes(sites, sites[0]?.id).includes(s));

/** A group of scope checkboxes. My site is on and cannot be switched off. */
export function ScopeChoices({
  legend,
  scopes,
  selected,
  disabled,
  onChange,
}: {
  legend: string;
  scopes: LeaderboardScope[];
  selected: LeaderboardScope[];
  disabled: boolean;
  onChange: (next: LeaderboardScope[]) => void;
}) {
  const t = useT();
  return (
    <Group legend={legend}>
      {scopes.map((s) => (
        <Check
          key={s}
          label={scopeLabel(t, s)}
          checked={s === 'site' || selected.includes(s)}
          disabled={disabled || s === 'site'}
          onChange={(on) => {
            const next = on ? [...selected, s] : selected.filter((x) => x !== s);
            onChange(ORDER.filter((x) => x === 'site' || next.includes(x)));
          }}
        />
      ))}
    </Group>
  );
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 mt-3 min-w-0 border-0 p-0">
      <legend className="mb-1 font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-x-4">{children}</div>
    </fieldset>
  );
}

function Check({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex min-h-[var(--target-min)] cursor-pointer items-center gap-2 has-[:focus-visible]:outline-[length:3px] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-focus)]">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
        className="h-5 w-5"
      />
      <span>{label}</span>
    </label>
  );
}

export function SitesBoardSettings({
  settings,
  sites,
  canManage,
  scopes,
}: {
  settings: StandingBoardSettings;
  sites: Site[];
  canManage: boolean;
  scopes: LeaderboardScope[];
}) {
  const t = useT();
  const { save, busy, problem } = useSaveSettings(settings);
  const board = settings.siteBoard;
  const [measures, setMeasures] = useState<string[]>(board.measures);
  const [staffScopes, setStaffScopes] = useState<LeaderboardScope[]>(board.staffScopes);
  const [threshold, setThreshold] = useState(String(board.smallSiteMinActive));
  const [excluded, setExcluded] = useState<string[]>(board.excludedSiteIds);
  const [message, setMessage] = useState<{ kind: 'saved' | 'error'; text: string } | null>(null);

  const submit = async () => {
    const min = Number(threshold);
    if (measures.length === 0) {
      setMessage({ kind: 'error', text: t('leaderboard.siteBoardNeedMeasure') });
      return;
    }
    if (!Number.isInteger(min) || min < 1) {
      setMessage({ kind: 'error', text: t('leaderboard.siteBoardNeedThreshold') });
      return;
    }
    const ok = await save({
      ...settings,
      siteBoard: { ...board, measures, staffScopes, smallSiteMinActive: min, excludedSiteIds: excluded },
    });
    setMessage(ok ? { kind: 'saved', text: t('leaderboard.siteBoardSaved') } : null);
  };
  const toggle = <T extends string>(list: T[], item: T, on: boolean): T[] =>
    on ? [...list, item] : list.filter((x) => x !== item);

  return (
    <section aria-labelledby="c14-sites-board" className="mt-6">
      <h2 id="c14-sites-board" className="mb-2 text-xl font-bold">
        {t('sitesBoard.title')}
      </h2>
      <p className="mt-0">{t('sitesBoard.intro')}</p>
      <Switch
        label={t('sitesBoard.title')}
        checked={board.enabled}
        disabled={!canManage || busy}
        onLabel={t('leaderboard.on')}
        offLabel={t('leaderboard.off')}
        onChange={(on) => {
          void save({ ...settings, siteBoard: { ...board, enabled: on } });
        }}
      />
      <Group legend={t('leaderboard.siteBoardMeasures')}>
        {SITE_MEASURES.map((m) => (
          <Check
            key={m}
            label={measureLabel(t, m)}
            checked={measures.includes(m)}
            disabled={!canManage}
            onChange={(on) => {
              setMeasures(toggle(measures, m, on));
            }}
          />
        ))}
      </Group>
      <ScopeChoices
        legend={t('leaderboard.boardScopes', { board: t('sitesBoard.title') })}
        scopes={scopes}
        selected={staffScopes}
        disabled={!canManage}
        onChange={setStaffScopes}
      />
      <label className="mt-3 flex max-w-xs flex-col gap-1 font-semibold">
        {t('leaderboard.siteBoardThreshold')}
        <input
          type="number"
          min={1}
          step={1}
          value={threshold}
          disabled={!canManage}
          onChange={(e) => {
            setThreshold(e.target.value);
          }}
          className="min-h-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]"
        />
      </label>
      <Group legend={t('leaderboard.siteBoardLeaveOut')}>
        {sites.map((s) => (
          <Check
            key={s.id}
            label={s.name}
            checked={excluded.includes(s.id)}
            disabled={!canManage}
            onChange={(on) => {
              setExcluded(toggle(excluded, s.id, on));
            }}
          />
        ))}
      </Group>
      {canManage ? (
        <div className="mt-3">
          <Button
            disabled={busy}
            onClick={() => {
              void submit();
            }}
          >
            {t('leaderboard.siteBoardSave')}
          </Button>
        </div>
      ) : null}
      {message?.kind === 'saved' ? <p role="status">{message.text}</p> : null}
      {message?.kind === 'error' ? <p role="alert">{message.text}</p> : null}
      {problem ? <p role="alert">{problem}</p> : null}
    </section>
  );
}

/** Every site, best first, for the organisation or one region, with a drill-down for each. */
export function FullRanking({ settings, sites }: { settings: StandingBoardSettings; sites: Site[] }) {
  const t = useT();
  const measures = settings.siteBoard.measures.filter((m): m is SiteMeasure =>
    (SITE_MEASURES as readonly string[]).includes(m),
  );
  const [measure, setMeasure] = useState<SiteMeasure | undefined>(undefined);
  const [period, setPeriod] = useState<SiteBoardPeriod>('thisMonth');
  const [scope, setScope] = useState('all');
  const [open, setOpen] = useState<SitesBoardRow | null>(null);
  const current = measure && measures.includes(measure) ? measure : measures[0];
  const regions = [...new Set(sites.map((s) => s.region).filter((r): r is string => r !== undefined))].sort((a, b) =>
    a.localeCompare(b, 'en-GB'),
  );
  const ranking = useSitesBoard({
    measure: current ?? 'participation',
    period,
    scope: scope === 'all' ? 'all' : 'region',
    ...(scope === 'all' ? {} : { region: scope }),
  });
  return (
    <section aria-labelledby="c14-ranking" className="mt-6">
      <h2 id="c14-ranking" className="mb-2 text-xl font-bold">
        {t('leaderboard.fullRanking')}
      </h2>
      <p className="mt-0">{t('leaderboard.fullRankingIntro')}</p>
      {current ? (
        <div className="flex flex-col gap-3">
          <SegmentedControl
            legend={t('sitesBoard.measure')}
            options={measures.map((m) => ({ value: m, label: measureLabel(t, m) }))}
            value={current}
            onChange={(v) => {
              setMeasure(v as SiteMeasure);
            }}
          />
          <SegmentedControl
            legend={t('leaderboard.rankingPeriod')}
            options={(['thisMonth', 'thisQuarter'] as const).map((p) => ({
              value: p,
              label: t(`compete.periods.${p}`),
            }))}
            value={period}
            onChange={(v) => {
              setPeriod(v === 'thisQuarter' ? 'thisQuarter' : 'thisMonth');
            }}
          />
          <label className="flex max-w-xs flex-col gap-1 font-semibold">
            {t('leaderboard.rankingScope')}
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
              }}
              className="min-h-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]"
            >
              <option value="all">{t('sites.all')}</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          {ranking.isError ? <p role="alert">{t('sitesBoard.loadError')}</p> : null}
          {ranking.data ? (
            ranking.data.rows.length === 0 ? (
              <p className="m-0">{t('leaderboard.rankingEmpty')}</p>
            ) : (
              <ol aria-label={t('leaderboard.fullRanking')} className="m-0 flex list-none flex-col gap-2 p-0">
                {ranking.data.rows.map((r) => (
                  <li
                    key={r.siteId}
                    data-testid="ranking-row"
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
                  >
                    <span className="min-w-12 font-bold">{ordinalText(t, r.rank)}</span>
                    <span className="flex-1 font-semibold">{r.siteName}</span>
                    {r.small ? <span className="text-sm font-semibold">{t('leaderboard.smallSite')}</span> : null}
                    <span>{siteValueText(current, r.value)}</span>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setOpen(r);
                      }}
                    >
                      {t('leaderboard.drillDown', { name: r.siteName })}
                    </Button>
                  </li>
                ))}
              </ol>
            )
          ) : ranking.isError ? null : (
            <p>{t('shell.loading')}</p>
          )}
        </div>
      ) : null}
      <Dialog
        open={open !== null}
        title={open?.siteName ?? ''}
        onClose={() => {
          setOpen(null);
        }}
      >
        {open && current ? (
          <div className="flex flex-col gap-2">
            <p className="m-0">
              {open.eligible === 1
                ? t('leaderboard.eligibleOne')
                : t('leaderboard.eligiblePeople', { count: open.eligible })}
            </p>
            <p className="m-0">{`${measureLabel(t, current)}: ${siteValueText(current, open.value)}`}</p>
            <p className="m-0">{t('leaderboard.rankLine', { ordinal: ordinalText(t, open.rank) })}</p>
            {open.small ? <p className="m-0 font-semibold">{t('leaderboard.smallSite')}</p> : null}
            <div>
              <Button
                variant="quiet"
                onClick={() => {
                  setOpen(null);
                }}
              >
                {t('leaderboard.close')}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}
