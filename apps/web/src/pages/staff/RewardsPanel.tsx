import { useQuery } from '@tanstack/react-query';
import { Card, Celebration } from '@sta/ui';
import { staffSummary, xpForAttempt, type Attempt, type Module, type XpKind } from '@sta/domain';
import type { MessageKey } from '@sta/content';
import { useDisplayPrefs } from '../../app/display/context';
import { useActor, useClock, useStore, useT } from '../../app/hooks';
import { badgeDefinitionFor, useRewards, type RewardsData } from './rewardsQueries';

const XP_ORDER: XpKind[] = [
  'lesson',
  'correct',
  'closedBookBonus',
  'passed',
  'mastery',
  'earlyRefresher',
  'weeklyGoal',
  'battle',
];

/** True when this pass is what made the person fully compliant. */
function turnedGreen(data: RewardsData, attempt: Attempt, module: Module, now: Date): boolean {
  const passEvent = data.events.find((e) => e.attemptId === attempt.id && e.type === 'moduleCompleted');
  if (!passEvent) return false;
  const input = {
    person: data.person,
    site: data.site,
    requirements: data.requirements,
    submissions: data.submissions,
    assignments: data.assignments,
    modules: data.modules,
    now,
    amberWindowDays: data.client.settings.amberWindowDays,
  };
  const after = staffSummary({ ...input, evidence: data.evidence });
  const before = staffSummary({
    ...input,
    evidence: data.evidence.filter((e) => !(e.moduleId === module.id && e.completedAt === passEvent.at)),
    // Passing closes the module's assignments, so open them again to see how things stood just before.
    assignments: data.assignments.map((a) =>
      a.status === 'done' && 'moduleId' in a.target && a.target.moduleId === module.id
        ? { ...a, status: 'open' as const }
        : a,
    ),
  });
  return after.complete && !before.complete;
}

/** Position on the Most questions answered correctly board. Private: staff rows never carry anyone else's name. */
function PositionLine() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const q = useQuery({
    queryKey: ['standing', actor.userId, 'correctQuestions', 'allTime'],
    queryFn: () => store.leaderboards.standing(actor, { board: 'correctQuestions', period: 'allTime' }),
  });
  const v = q.data?.viewer;
  if (!q.data || !q.data.visible || !v) return null;
  const rule = new Intl.PluralRules('en-GB', { type: 'ordinal' }).select(v.rank ?? 0) as
    'one' | 'two' | 'few' | 'other';
  const text =
    v.rank === null
      ? t('staff.results.positionUnranked')
      : t('staff.results.position', { ordinal: t(`leaderboard.ordinal.${rule}`, { n: v.rank }), of: v.of });
  return (
    <p data-testid="position-line" className="mb-4">
      {text}
      {v.hidden ? ` ${t('staff.results.positionPrivate')}.` : ''}
    </p>
  );
}

/** S7 rewards for a passed attempt: celebration, XP and why, new badges and the private position. */
export function RewardsPanel({ attempt, module }: { attempt: Attempt; module: Module }) {
  const t = useT();
  const now = useClock().now();
  const { prefs } = useDisplayPrefs();
  const rewards = useRewards();
  const data = rewards.data;
  const green = data ? turnedGreen(data, attempt, module, now) : false;
  const byKind = data ? xpForAttempt(data.ledger, attempt.id, data.events) : {};
  const rows = XP_ORDER.flatMap((kind) => {
    const amount = byKind[kind];
    return amount ? [{ kind, amount }] : [];
  });
  const total = rows.reduce((n, r) => n + r.amount, 0);
  const fresh = (data?.badges ?? []).filter((b) => b.at >= attempt.startedAt);
  return (
    <>
      <div data-testid="celebration" className="mb-4">
        <Celebration
          message={green ? t('staff.home.compliant') : t('celebration.quizPassed')}
          reducedMotion={prefs.reduceMotion || prefs.simpleView}
        />
      </div>
      {rows.length > 0 ? (
        <section aria-labelledby="xp-earned-heading" className="mb-4">
          <Card>
            <h2 id="xp-earned-heading" className="mt-0 mb-2 text-xl font-bold">
              {t('staff.results.xpTitle')}
            </h2>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {rows.map((r) => (
                <li
                  key={r.kind}
                  data-testid="xp-row"
                  data-kind={r.kind}
                  data-amount={r.amount}
                  className="flex justify-between gap-2"
                >
                  <span>{t(`staff.results.xpKinds.${r.kind}`)}</span>
                  <span className="font-semibold">{t('staff.results.xpRow', { xp: r.amount })}</span>
                </li>
              ))}
            </ul>
            <p data-testid="xp-total" className="mb-0 mt-2 text-lg font-bold">
              {t('staff.results.xpTotal', { xp: total })}
            </p>
          </Card>
        </section>
      ) : null}
      {fresh.length > 0 ? (
        <section aria-labelledby="new-badge-heading" className="mb-4">
          <Card>
            <h2 id="new-badge-heading" className="mt-0 mb-2 text-xl font-bold">
              {t('staff.results.newBadge')}
            </h2>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {fresh.map((b) => {
                const def = badgeDefinitionFor(b.badgeId);
                return def ? (
                  <li key={b.badgeId}>
                    <span className="font-semibold">{t(def.nameKey as MessageKey)}</span>
                    {': '}
                    {t(def.descriptionKey as MessageKey)}
                  </li>
                ) : null;
              })}
            </ul>
          </Card>
        </section>
      ) : null}
      <PositionLine />
    </>
  );
}
