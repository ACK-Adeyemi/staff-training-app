// C14 Leaderboard settings: switch the standing boards on or off. Region, country and all-sites scopes come with M3.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Icon, PageHeader, Switch } from '@sta/ui';
import { can, type BoardId, type LeaderboardScope, type Site, type StandingBoardSettings } from '@sta/domain';
import { useActor, useStore, useT } from '../../app/hooks';
import { competitionErrorKey } from '../compete/errors';
import { useBoardSettings } from '../compete/queries';
import { BOARD_ORDER, boardTitle } from '../compete/shared';
import { orEmpty, usePermissions } from './queries';
import { applicableScopes, FullRanking, ScopeChoices, SitesBoardSettings } from './SitesBoardSettings';

const LATER_SCOPES = ['region', 'country', 'all'] as const;

function Settings({
  settings,
  canManage,
  sites,
}: {
  settings: StandingBoardSettings;
  canManage: boolean;
  sites: Site[];
}) {
  const multi = sites.length > 1;
  const scopes = applicableScopes(sites);
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const change = async (board: BoardId, patch: { enabled?: boolean; staffScopes?: LeaderboardScope[] }) => {
    setBusy(true);
    setProblem(null);
    try {
      const current = settings.boards[board];
      await store.leaderboards.saveSettings(actor, {
        ...settings,
        boards: {
          ...settings.boards,
          [board]: {
            enabled: patch.enabled ?? current?.enabled !== false,
            staffScopes: patch.staffScopes ?? current?.staffScopes ?? ['site'],
          },
        },
      });
      await queryClient.invalidateQueries();
    } catch (e) {
      setProblem(t(competitionErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <p className="mt-0">{t('leaderboard.settingsIntro')}</p>
      {canManage ? null : <p role="note">{t('leaderboard.readOnly')}</p>}
      {problem ? <p role="alert">{problem}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {BOARD_ORDER.map((b) => (
          <li key={b}>
            <Card>
              <Switch
                label={boardTitle(t, b)}
                checked={settings.boards[b]?.enabled !== false}
                disabled={!canManage || busy}
                onLabel={t('leaderboard.on')}
                offLabel={t('leaderboard.off')}
                onChange={(v) => {
                  void change(b, { enabled: v });
                }}
              />
              {multi ? (
                <ScopeChoices
                  legend={t('leaderboard.boardScopes', { board: boardTitle(t, b) })}
                  scopes={scopes}
                  selected={settings.boards[b]?.staffScopes ?? ['site']}
                  disabled={!canManage || busy}
                  onChange={(next) => {
                    void change(b, { staffScopes: next });
                  }}
                />
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
      {multi ? (
        <>
          <SitesBoardSettings settings={settings} sites={sites} canManage={canManage} scopes={scopes} />
          {canManage ? <FullRanking settings={settings} sites={sites} /> : null}
        </>
      ) : (
        <section aria-labelledby="c14-scopes" className="mt-6">
          <h2 id="c14-scopes" className="mb-2 text-xl font-bold">
            {t('leaderboard.staffScopes')}
          </h2>
          <ul className="m-0 list-none p-0">
            <li className="flex min-h-[var(--target-min)] flex-wrap items-center gap-2 py-1 font-semibold">
              <Icon name="check" size={16} />
              <span>{t('leaderboard.scopes.site')}</span>
              <span className="font-normal">{t('leaderboard.selected')}</span>
            </li>
            {LATER_SCOPES.map((s) => (
              <li key={s} className="flex min-h-[var(--target-min)] flex-wrap items-center gap-2 py-1">
                <span className="font-semibold">{t(`leaderboard.scopes.${s}`)}</span>
                <span>{t('leaderboard.scopeLater')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="c14-privacy" className="mt-6">
        <h2 id="c14-privacy" className="mb-2 text-xl font-bold">
          {t('leaderboard.privacyTitle')}
        </h2>
        <p className="m-0">{t('leaderboard.privacy')}</p>
      </section>
    </>
  );
}

export function LeaderboardSettings() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const perms = usePermissions();
  const settings = useBoardSettings();
  const sites = useQuery({
    queryKey: ['leaderboardSites', actor.userId],
    queryFn: () => orEmpty(store.sites.list(actor)),
  });
  const header = <PageHeader title={t('leaderboard.settingsTitle')} />;
  if (!perms.data) return <p>{t('shell.loading')}</p>;
  const target = actor.clientId ? { clientId: actor.clientId } : undefined;
  if (!target || !can(perms.data, 'competitions.view', target, 'read')) {
    return (
      <>
        {header}
        <p role="alert">{t('competition.noAccess')}</p>
      </>
    );
  }
  return (
    <>
      {header}
      {settings.isError ? <p role="alert">{t('leaderboard.loadError')}</p> : null}
      {settings.data && sites.data ? (
        <Settings
          settings={settings.data}
          sites={sites.data.filter((x) => x.status === 'active')}
          canManage={can(perms.data, 'competitions.manage', target, 'write')}
        />
      ) : settings.isError ? null : (
        <p>{t('shell.loading')}</p>
      )}
    </>
  );
}
