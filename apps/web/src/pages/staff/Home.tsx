import { Badge, Card, LinkButton, PageHeader, ProgressRing } from '@sta/ui';
import { staffRingPercent, type Assignment, type ComingUpItem, type Module, type StaffSummary } from '@sta/domain';
import { useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { useStaffData } from './queries';

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
        <LinkButton href={`#/staff/learn/${moduleId}`} aria-label={`${t('staff.home.start')}: ${title}`}>
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

/** S2. */
export function Home() {
  const t = useT();
  const q = useStaffData();
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
    </>
  );
}
