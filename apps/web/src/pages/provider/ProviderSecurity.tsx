// P19 Security (M4 chunk 15b, BP-8, brief 22.6). The person's own two-step status plus simulated, device-local
// sessions and trusted-device choice. Nothing here is stored or sent anywhere.
import { useState, type ReactNode } from 'react';
import { Button, PageHeader, Switch } from '@sta/ui';
import { useT } from '../../app/hooks';
import { useTwoFactorStatus } from '../client/foundationsQueries';

const box = 'mb-6 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4';

function Region({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={box}>
      <h2 id={id} className="mt-0 mb-2 text-xl font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Security() {
  const t = useT();
  const status = useTwoFactorStatus();
  const [signedOut, setSignedOut] = useState(false);
  const [trust, setTrust] = useState(false);
  const kind = status.data?.kind;

  // The page waits for the status, so what shows is never a half-loaded state.
  if (status.isError)
    return (
      <>
        <PageHeader title={t('provider.security.heading')} />
        <p role="alert">{t('twoFactor.loadError')}</p>
      </>
    );
  if (!status.data) return <p>{t('shell.loading')}</p>;

  return (
    <>
      <PageHeader title={t('provider.security.heading')} />
      <p className="mb-2 font-semibold">{t('provider.security.demoOnly')}</p>
      <p className="mb-6">{t('provider.security.policy')}</p>
      <Region id="p19-status" title={t('provider.security.yourStatus')}>
        <p className="m-0">
          {kind === 'enrolled' ? t('provider.security.status.enrolled') : t('provider.security.status.notYet')}
        </p>
      </Region>
      <Region id="p19-sessions" title={t('provider.security.sessions')}>
        <ul className="m-0 mb-3 list-none p-0">
          <li data-testid="session-row">{t('provider.security.thisDevice')}</li>
        </ul>
        <Button
          variant="secondary"
          onClick={() => {
            setSignedOut(true);
          }}
        >
          {t('provider.security.signOutAll')}
        </Button>
        {signedOut ? (
          <p role="status" className="mt-2 mb-0">
            {t('provider.security.signedOut')}
          </p>
        ) : null}
      </Region>
      <Region id="p19-trust" title={t('provider.security.trustTitle')}>
        <Switch
          label={t('provider.security.trust')}
          checked={trust}
          onChange={setTrust}
          onLabel={t('provider.security.on')}
          offLabel={t('provider.security.off')}
        />
      </Region>
    </>
  );
}
