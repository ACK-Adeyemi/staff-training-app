import { Card, LinkButton, PageHeader } from '@sta/ui';
import { focusClasses } from '@sta/ui';
import { useDemo, useT } from '../../app/hooks';
import { Standalone } from '../../pages/pages';

const exploreLink = `block min-h-[var(--target-min)] rounded-[var(--radius-md)] py-2 text-[var(--color-accent)] underline ${focusClasses}`;

/** D1. */
export function Landing() {
  const t = useT();
  const demo = useDemo();
  const industry = demo.state.industry;
  return (
    <Standalone>
      <PageHeader title={t('demo.chooseSurface')} />
      <p className="mb-4">{t('demo.landingIntro')}</p>
      <p
        data-testid="demo-honest-note"
        className="mb-6 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3"
      >
        {t('demo.honestNote')}
      </p>
      <fieldset className="mb-6 border-0 p-0">
        <legend className="mb-2 text-lg font-bold">{t('demo.chooseIndustry')}</legend>
        <div className="flex flex-col gap-2">
          <label className="flex min-h-[var(--target-min)] items-center gap-3">
            <input
              type="radio"
              name="industry"
              value="nursery"
              checked={industry === 'nursery'}
              onChange={() => {
                void demo.setIndustry('nursery');
              }}
              className="size-5"
            />
            <span>{t('demo.industryNursery')}</span>
          </label>
          <label className="flex min-h-[var(--target-min)] items-center gap-3">
            <input
              type="radio"
              name="industry"
              value="luxuryRetail"
              checked={industry === 'luxuryRetail'}
              disabled
              onChange={() => undefined}
              className="size-5"
            />
            <span>
              {t('demo.industryLuxuryRetail')} <span className="text-sm">{t('demo.laterBuild')}</span>
            </span>
          </label>
        </div>
      </fieldset>
      <h2 className="mb-2 text-lg font-bold">{t('demo.tours')}</h2>
      <div className="mb-6 flex flex-col gap-3">
        <div>
          <LinkButton href="#/client">{t('demo.clientTour')}</LinkButton>
          <p className="mt-1 mb-0 text-sm">{t('demo.clientTourHint')}</p>
        </div>
        <div>
          <LinkButton href="#/provider">{t('demo.providerTour')}</LinkButton>
          <p className="mt-1 mb-0 text-sm">{t('demo.providerTourHint')}</p>
        </div>
      </div>
      <section aria-labelledby="explore-freely">
        <Card>
          <h2 id="explore-freely" className="mt-0 mb-2 text-lg font-bold">
            {t('demo.exploreFreely')}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {(
              [
                ['#/staff', 'demo.surfaceStaff', 'demo.surfaceStaffHint'],
                ['#/client', 'demo.surfaceClient', 'demo.surfaceClientHint'],
                ['#/provider', 'demo.surfaceProvider', 'demo.surfaceProviderHint'],
              ] as const
            ).map(([href, label, hint]) => (
              <li key={href}>
                <a href={href} className={exploreLink}>
                  {t(label)}
                  <span className="block text-sm text-[var(--color-text)] no-underline">{t(hint)}</span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </Standalone>
  );
}
