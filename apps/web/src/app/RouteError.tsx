import { useEffect } from 'react';
import { useRouteError } from 'react-router';
import { AccountStateError, ForbiddenError, NotFoundError, ValidationError } from '@sta/data';
import type { MessageKey } from '@sta/content';
import { Button } from '@sta/ui';
import { recordCaughtError } from './errorRecorder';
import { useDemo, useStore, useT } from './hooks';

const storageErrors = new Set(['QuotaExceededError', 'InvalidStateError', 'SecurityError', 'UnknownError']);

export function errorKey(error: unknown): MessageKey {
  if (error instanceof ForbiddenError) return 'errors.forbidden';
  if (error instanceof NotFoundError) return 'errors.notFound';
  if (error instanceof AccountStateError) return 'errors.accountState';
  if (error instanceof ValidationError) return 'errors.validation';
  if (error instanceof DOMException && storageErrors.has(error.name)) return 'errors.storage';
  return 'errors.unknown';
}

/** Plain-language error page. Never shows the raw error. */
export function RouteError() {
  const error = useRouteError();
  const t = useT();
  const demo = useDemo();
  const store = useStore();
  useEffect(() => {
    recordCaughtError(store, error);
  }, [store, error]);
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-4 text-2xl font-bold">{t('shell.errorTitle')}</h1>
      <p role="alert" className="mb-6">
        {t(errorKey(error))}
      </p>
      <Button
        onClick={() => {
          void demo.reset();
        }}
      >
        {t('demo.reset')}
      </Button>
    </main>
  );
}
