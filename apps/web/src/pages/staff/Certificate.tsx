import { useQuery } from '@tanstack/react-query';
import { Button } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { LearningFrame } from './LearningFrame';
import { useModuleId } from './learningQueries';
import { focusLink } from './styles';

/** Certificate of completion for the latest pass. Sits outside the staff chrome so it prints cleanly. */
export function Certificate() {
  const t = useT();
  const moduleId = useModuleId();
  return (
    <main className="mx-auto max-w-2xl p-4">
      <LearningFrame>
        {({ module, person, client, evidence }) => {
          const latest = [...evidence]
            .filter((e) => e.kind === 'module')
            .sort((a, b) => (a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0))[0];
          const back = (
            <a
              href={`#/staff/module/${moduleId}`}
              className={`inline-flex min-h-[var(--target-min)] items-center underline print:hidden ${focusLink}`}
            >
              {t('staff.certificate.back')}
            </a>
          );
          if (!latest) {
            return (
              <>
                <h1 className="text-2xl font-bold">{module.title}</h1>
                <p role="alert">{t('staff.certificate.none')}</p>
                {back}
              </>
            );
          }
          return (
            <CertificateBody
              title={module.title}
              version={latest.moduleVersion ?? module.version}
              name={`${person.firstName} ${person.lastName}`}
              completedAt={latest.completedAt}
              clientName={client.displayName}
              siteId={latest.siteIdAtTime}
              back={back}
            />
          );
        }}
      </LearningFrame>
    </main>
  );
}

function CertificateBody({
  title,
  version,
  name,
  completedAt,
  clientName,
  siteId,
  back,
}: {
  title: string;
  version: number;
  name: string;
  completedAt: string;
  clientName: string;
  siteId: string;
  back: React.ReactNode;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const site = useQuery({ queryKey: ['site', siteId], queryFn: () => store.sites.get(actor, siteId) });
  return (
    <article className="rounded-[var(--radius-md)] border-4 border-[var(--color-border)] p-6 text-center">
      <h1 className="mt-0 text-3xl font-bold">{t('staff.certificate.title')}</h1>
      <p>{t('staff.certificate.certifies')}</p>
      <p className="text-2xl font-bold">{name}</p>
      <p>{t('staff.certificate.completed')}</p>
      <p className="text-xl font-semibold">{title}</p>
      <p>{t('staff.certificate.version', { version })}</p>
      <p>{t('staff.certificate.completedOn', { date: formatLondonDate(completedAt) })}</p>
      <p>{t('staff.certificate.where', { client: clientName, site: site.data?.name ?? '' })}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3 print:hidden">
        <Button
          onClick={() => {
            window.print();
          }}
        >
          {t('staff.certificate.print')}
        </Button>
        {back}
      </div>
    </article>
  );
}
