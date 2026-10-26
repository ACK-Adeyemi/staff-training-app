import { LevelBar } from '@sta/ui';
import { useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import type { RewardsData } from './rewardsQueries';

const RECENT = 30;

/** S8 XP and level tab. Taking longer never costs anything, and the page says so. */
export function ProgressXp({ data }: { data: RewardsData }) {
  const t = useT();
  const { level, totalXp, ledger } = data;
  const entries = [...ledger]
    .reverse()
    .filter((e) => e.amount > 0 || e.capped)
    .slice(0, RECENT);
  return (
    <div className="flex flex-col gap-4">
      <LevelBar
        value={level.xpIntoLevel}
        max={level.xpForNext}
        label={t('staff.progress.levelSentence', {
          level: level.level,
          xp: level.xpForNext - level.xpIntoLevel,
          next: level.level + 1,
        })}
      />
      <p className="m-0 text-lg font-bold">{t('xp.total', { xp: totalXp })}</p>
      <p className="m-0">{t('xp.note')}</p>
      <section aria-labelledby="xp-recent">
        <h2 id="xp-recent" className="mt-0 text-xl font-bold">
          {t('staff.progress.xpEntries')}
        </h2>
        {entries.length === 0 ? (
          <p>{t('staff.progress.noXp')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {entries.map((e, n) => (
              <li
                key={`${e.sourceEventId}-${e.kind}-${n}`}
                data-testid="xp-entry"
                data-kind={e.kind}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] py-2"
              >
                <span>
                  {t(`staff.results.xpKinds.${e.kind}`)}
                  {e.capped ? ` (${t('staff.progress.capped')})` : ''}
                </span>
                <span className="font-semibold">
                  {t('staff.results.xpRow', { xp: e.amount })}
                  {', '}
                  {formatLondonDate(e.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
