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

function Standalone({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-xl p-4">{children}</main>;
}

/** D1. Chunk 12 adds the industry choice and tours. */
export function Landing() {
  const t = useT();
  return (
    <Standalone>
      <PageHeader title={t('demo.chooseSurface')} />
      <p className="mb-4">{t('demo.landingIntro')}</p>
      <div className="flex flex-col gap-3">
        <LinkButton href="#/staff">{t('demo.surfaceStaff')}</LinkButton>
        <LinkButton href="#/client" variant="secondary">
          {t('demo.surfaceClient')}
        </LinkButton>
        <LinkButton href="#/provider" variant="secondary">
          {t('demo.surfaceProvider')}
        </LinkButton>
      </div>
    </Standalone>
  );
}

/** D3. Chunk 12 lists the messages. */
export function Outbox() {
  const t = useT();
  return (
    <Standalone>
      <PageHeader title={t('demo.outboxTitle')} />
      <p>{t('demo.outboxEmpty')}</p>
    </Standalone>
  );
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
