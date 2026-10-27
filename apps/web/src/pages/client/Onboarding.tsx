// C25 Onboarding checklist: the first steps, ticked off by themselves as the work happens (brief 23.1).
import { useState } from 'react';
import { Button, Card, Icon, LinkButton, PageHeader } from '@sta/ui';
import type { MessageKey } from '@sta/content';
import { useT } from '../../app/hooks';
import { useOnboarding } from './foundationsQueries';

const LINKS: Record<string, string> = {
  inviteStaff: '#/client/team',
  assignTraining: '#/client/assign',
  setUpCompetition: '#/client/competitions/new',
  exportMatrix: '#/client/reports/matrix',
};

export function Onboarding() {
  const t = useT();
  const view = useOnboarding();
  const [hidden, setHidden] = useState(false);
  const header = <PageHeader title={t('onboarding.title')} />;
  if (view.isError)
    return (
      <>
        {header}
        <p role="alert">{t('onboarding.loadError')}</p>
      </>
    );
  if (!view.data)
    return (
      <>
        {header}
        <p>{t('shell.loading')}</p>
      </>
    );
  const steps = view.data.steps;
  const done = steps.filter((s) => s.done).length;
  if (hidden) {
    return (
      <>
        {header}
        <p>{t('onboarding.hidden')}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setHidden(false);
          }}
        >
          {t('onboarding.show')}
        </Button>
      </>
    );
  }
  return (
    <>
      {header}
      <p className="mt-0">{t('onboarding.intro')}</p>
      <Card>
        <p className="mt-0 mb-3 font-semibold">{t('onboarding.progress', { done, total: steps.length })}</p>
        {done === steps.length ? <p className="mt-0 mb-3 font-bold">{t('onboarding.done')}</p> : null}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {steps.map((s) => {
            const name = t(`onboarding.steps.${s.key}` as MessageKey);
            const link = LINKS[s.key];
            return (
              <li
                key={s.key}
                data-testid={`onboarding-step-${s.key}`}
                data-done={String(s.done)}
                className="flex min-h-[var(--target-min)] flex-wrap items-center gap-2"
              >
                <Icon name={s.done ? 'check' : 'minus-circle'} size={20} />
                <span className="font-semibold">{name}</span>
                <span>{s.done ? t('onboarding.stepDone') : t('onboarding.stepNotDone')}</span>
                {link && !s.done ? (
                  <LinkButton variant="secondary" href={link} aria-label={`${t('onboarding.go')}: ${name}`}>
                    {t('onboarding.go')}
                  </LinkButton>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
      <div className="mt-4">
        <Button
          variant="quiet"
          onClick={() => {
            setHidden(true);
          }}
        >
          {t('onboarding.dismiss')}
        </Button>
      </div>
    </>
  );
}
