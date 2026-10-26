import { useState } from 'react';
import { Badge, Button, Card, GoalRing, LinkButton, PageHeader, ProgressRing } from '@sta/ui';
import {
  competitionStatus,
  staffRingPercent,
  type Assignment,
  type Competition,
  type ComingUpItem,
  type Module,
  type StaffSummary,
} from '@sta/domain';
import type { MessageKey } from '@sta/content';
import { useClock, useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { CompetitionSheet } from '../compete/CompetitionSheet';
import { useStaffData } from './queries';
import { badgeDefinitionFor, latestBadge, useRewards, type RewardsData } from './rewardsQueries';
import { focusLink } from './styles';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-4">
      <Card>
        <h2 id={id} className="mt-0 mb-3 text-lg font-bold">
          {title}
        </h2>
        {children}
      </Card>
    </section>
  );
}

function NextUp({ summary, modules }: { summary: StaffSummary; modules: Module[] }) {
  const t = useT();
  const next = summary.nextUp;
  if (next.kind === 'allCaughtUp') return <p className="m-0">{t('staff.home.allCaughtUp')}</p>;
  const moduleId =
    next.kind === 'assignment'
      ? 'moduleId' in next.assignment.target
        ? next.assignment.target.moduleId
        : undefined
      : next.moduleId;
  const title = modules.find((m) => m.id === moduleId)?.title ?? '';
  const dueAt = next.kind === 'assignment' ? next.assignment.dueAt : undefined;
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="m-0 text-lg font-semibold">{title}</p>
      {dueAt ? <p className="m-0">{t('staff.home.dueOn', { date: formatLondonDate(dueAt) })}</p> : null}
      {moduleId ? (
        <LinkButton href={`#/staff/module/${moduleId}`} aria-label={`${t('staff.home.start')}: ${title}`}>
          {t('staff.home.start')}
        </LinkButton>
      ) : null}
    </div>
  );
}

function comingUpText(
  item: ComingUpItem,
  summary: StaffSummary,
  modules: Module[],
  assignments: Assignment[],
  t: ReturnType<typeof useT>,
): string {
  if (item.kind === 'assignmentDue') {
    const a = assignments.find((x) => x.id === item.assignmentId);
    const moduleId = a && 'moduleId' in a.target ? a.target.moduleId : undefined;
    return t('staff.home.assignmentDue', { title: modules.find((m) => m.id === moduleId)?.title ?? '' });
  }
  const name = summary.rows.find((r) => r.requirement.id === item.requirementId)?.requirement.name ?? '';
  return t('staff.home.requirementExpiry', { name });
}

function WeeklyGoalSection({ goal }: { goal: RewardsData['goal'] }) {
  const t = useT();
  const { done, goal: target, met } = goal.thisWeek;
  const text = met ? t('weeklyGoal.met') : t('weeklyGoal.progress', { done, goal: target });
  return (
    <Section id="home-goal" title={t('weeklyGoal.title')}>
      <GoalRing
        label={text}
        percent={Math.min(100, Math.round((done / Math.max(1, target)) * 100))}
        valueText={`${Math.min(done, target)}/${target}`}
        description={text}
        completeLabel={t('weeklyGoal.met')}
        size={96}
      />
    </Section>
  );
}

function Banner({ competition, onDismiss }: { competition: Competition; onDismiss: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <li
      data-testid="competition-banner"
      className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-2"
    >
      <span>
        <button
          type="button"
          aria-label={t('staff.home.competitionDetails', { name: competition.name })}
          onClick={() => {
            setOpen(true);
          }}
          className={`block min-h-[var(--target-min)] cursor-pointer border-0 bg-transparent p-0 text-start font-semibold underline ${focusLink}`}
        >
          {competition.name}
        </button>
        <span className="block text-sm">
          {t('competition.prize')}: {competition.prizeText}
        </span>
        <span className="block text-sm">
          {t('staff.home.competitionEnds', { date: formatLondonDate(competition.endAt) })}
        </span>
      </span>
      <Button variant="secondary" onClick={onDismiss}>
        {t('staff.home.dismiss', { name: competition.name })}
      </Button>
      <CompetitionSheet
        competition={competition}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      />
    </li>
  );
}

function CompetitionBanners({ competitions }: { competitions: RewardsData['competitions'] }) {
  const t = useT();
  const now = useClock().now();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const live = competitions.filter((c) => competitionStatus(c, now) === 'live' && !dismissed.has(c.id));
  return (
    <Section id="home-competitions" title={t('staff.home.competitions')}>
      {live.length === 0 ? (
        <p className="m-0">{t('staff.home.noCompetitions')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {live.map((c) => (
            <Banner
              key={c.id}
              competition={c}
              onDismiss={() => {
                setDismissed(new Set([...dismissed, c.id]));
              }}
            />
          ))}
        </ul>
      )}
    </Section>
  );
}

function LatestBadge({ badges }: { badges: RewardsData['badges'] }) {
  const t = useT();
  const latest = latestBadge(badges);
  const def = latest ? badgeDefinitionFor(latest.badgeId) : undefined;
  return (
    <Section id="home-badge" title={t('staff.home.latestBadge')}>
      {latest && def ? (
        <p className="m-0">
          <span className="font-semibold">{t(def.nameKey as MessageKey)}</span>
          {': '}
          {t('staff.home.badgeEarnedOn', { date: formatLondonDate(latest.at) })}
        </p>
      ) : (
        <p className="m-0">{t('staff.home.noBadge')}</p>
      )}
    </Section>
  );
}

/** S2. */
export function Home() {
  const t = useT();
  const q = useStaffData();
  const rewards = useRewards();
  if (q.isError) return <p role="alert">{t('staff.home.loadError')}</p>;
  if (!q.data) return <p>{t('shell.loading')}</p>;
  const { summary, modules, assignments, personName } = q.data;
  return (
    <>
      <PageHeader title={t('nav.staff.home')} />
      <p className="m-0 text-lg">{t('staff.home.greeting', { name: personName })}</p>
      <div className="mb-4 flex flex-col items-center gap-2">
        <ProgressRing
          percent={staffRingPercent(summary)}
          valueText={t('staff.home.toDo', { count: summary.toDo })}
          description={
            summary.complete
              ? t('staff.home.ringDescriptionDone')
              : t('staff.home.ringDescription', { count: summary.toDo })
          }
          completeLabel={t('staff.home.compliant')}
          size={140}
        />
        {summary.waiting > 0 ? <Badge>{t('staff.home.waiting', { count: summary.waiting })}</Badge> : null}
      </div>
      <Section id="home-next" title={t('staff.home.nextUp')}>
        <NextUp summary={summary} modules={modules} />
      </Section>
      {rewards.data ? <WeeklyGoalSection goal={rewards.data.goal} /> : null}
      <Section id="home-coming" title={t('staff.home.comingUp')}>
        {summary.comingUp.length === 0 ? (
          <p className="m-0">{t('staff.home.nothingComing')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {summary.comingUp.map((item) => (
              <li key={`${item.kind}-${item.assignmentId ?? item.requirementId ?? item.at}`}>
                <span className="font-semibold">{formatLondonDate(item.at)}</span>
                {': '}
                {comingUpText(item, summary, modules, assignments, t)}
              </li>
            ))}
          </ul>
        )}
      </Section>
      {rewards.data ? (
        <>
          <CompetitionBanners competitions={rewards.data.competitions} />
          <LatestBadge badges={rewards.data.badges} />
        </>
      ) : null}
      <a href="#/staff/notes" className={`inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`}>
        {t('staff.home.myNotes')}
      </a>
    </>
  );
}
