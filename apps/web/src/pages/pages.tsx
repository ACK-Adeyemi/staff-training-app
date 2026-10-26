import type { ReactNode } from 'react';
import { useHref } from 'react-router';
import { LinkButton, PageHeader } from '@sta/ui';
import type { MessageKey } from '@sta/content';
import { useT } from '../app/hooks';

export function Placeholder({ titleKey, bodyKey }: { titleKey: MessageKey; bodyKey: MessageKey }) {
  const t = useT();
  return (
    <>
      <PageHeader title={t(titleKey)} />
      <p>{t(bodyKey)}</p>
    </>
  );
}

export function Standalone({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-xl p-4">{children}</main>;
}

export function NotFound() {
  const t = useT();
  const start = useHref('/');
  return (
    <Standalone>
      <PageHeader title={t('shell.notFoundTitle')} />
      <p className="mb-4">{t('shell.notFoundBody')}</p>
      <LinkButton href={start}>{t('shell.backToStart')}</LinkButton>
    </Standalone>
  );
}
