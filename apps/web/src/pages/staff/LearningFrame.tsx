import type { ReactNode } from 'react';
import { PageHeader } from '@sta/ui';
import { useT } from '../../app/hooks';
import { useLearning, useModuleId, type LearningData } from './learningQueries';

/** Loads the module data for the route and shows a plain message when it is loading or not available. */
export function LearningFrame({ children }: { children: (data: LearningData) => ReactNode }) {
  const t = useT();
  const moduleId = useModuleId();
  const q = useLearning(moduleId);
  if (q.isError) {
    return (
      <>
        <PageHeader title={t('staff.module.notFoundTitle')} />
        <p role="alert">{t('staff.module.notFound')}</p>
        <a href="#/staff/learn" className="inline-flex min-h-[var(--target-min)] items-center underline">
          {t('staff.module.backToLearn')}
        </a>
      </>
    );
  }
  if (!q.data) return <p>{t('shell.loading')}</p>;
  return <>{children(q.data)}</>;
}
