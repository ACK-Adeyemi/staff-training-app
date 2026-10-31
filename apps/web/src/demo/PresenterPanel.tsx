import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import type { PersonaListing } from '@sta/data';
import { Button, Dialog, focusClasses } from '@sta/ui';
import type { MessageKey } from '@sta/content';
import { useAppDate, useDemo, useT } from '../app/hooks';
import { formatLondonDay } from './format';

const later: MessageKey[] = ['demo.toggleSystemStatus', 'demo.clearProspectBranding'];
const jumps: { to: string; label: MessageKey }[] = [
  { to: '/staff', label: 'demo.surfaceStaff' },
  { to: '/client', label: 'demo.surfaceClient' },
  { to: '/provider', label: 'demo.surfaceProvider' },
];
const linkClass = `inline-flex min-h-[var(--target-min)] items-center text-[var(--color-accent)] underline ${focusClasses}`;

/** D2 skeleton. */
export function PresenterPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const demo = useDemo();
  const date = useAppDate();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [personas, setPersonas] = useState<PersonaListing[] | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void demo.listPersonas().then((list) => {
      if (live) setPersonas(list);
    });
    return () => {
      live = false;
    };
  }, [open, demo]);
  const jumpToPersona = (p: PersonaListing) => {
    void (async () => {
      await (p.side === 'client' ? demo.signInAsClient(p.userId) : demo.signInAs(p.userId));
      await navigate(p.side === 'client' ? '/client' : '/staff');
      // The actor changed, so anything already loaded belongs to someone else.
      await queryClient.invalidateQueries();
      // Closing last means "the panel is gone" also means "the jump is done", so nothing navigates a moment later.
      close();
    })();
  };
  // Fast-forward runs a day's scheduled jobs at a time. Closing waits for it, so "the panel is gone" means "it is done".
  const [running, setRunning] = useState(0);
  const [closeRequested, setCloseRequested] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setCloseRequested(false);
  }
  const finish = () => {
    setConfirming(false);
    onClose();
  };
  const close = () => {
    if (running > 0) setCloseRequested(true);
    else finish();
  };
  const forward = (days: number) => {
    setCloseRequested(false);
    setConfirming(false);
    setRunning((n) => n + 1);
    void (async () => {
      try {
        await demo.fastForward(days);
        // A fetch already running was started with the old date and a page that remounts would join it, so stop
        // those before marking everything out of date.
        await queryClient.cancelQueries();
        await queryClient.invalidateQueries();
      } finally {
        setRunning((n) => n - 1);
      }
    })();
  };
  useEffect(() => {
    if (closeRequested && running === 0) onClose();
  }, [closeRequested, running, onClose]);
  return (
    <Dialog open={open} title={t('demo.presenterPanel')} onClose={close}>
      {open ? (
        <>
          <p className="mt-0 mb-4 font-semibold">{t('demo.today', { date: formatLondonDay(date) })}</p>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                forward(1);
              }}
            >
              {t('demo.fastForwardOne')}
            </Button>
            {[7, 30].map((days) => (
              <Button
                key={days}
                variant="secondary"
                onClick={() => {
                  forward(days);
                }}
              >
                {t('demo.fastForward', { days })}
              </Button>
            ))}
            <Button
              variant="secondary"
              onClick={() => {
                void demo.backToToday();
              }}
            >
              {t('demo.backToToday')}
            </Button>
          </div>
          <div className="mb-4">
            <Button
              variant="secondary"
              onClick={() => {
                setConfirming(true);
              }}
            >
              {t('demo.reset')}
            </Button>
            {confirming ? (
              <div role="group" aria-label={t('demo.resetConfirmTitle')} className="mt-3">
                <p className="mt-0 mb-2 font-semibold">{t('demo.resetConfirmTitle')}</p>
                <p className="mt-0 mb-3">{t('demo.resetConfirmBody')}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      setConfirming(false);
                      void (async () => {
                        await demo.reset();
                        // The data was rebuilt in place, so anything already loaded is stale.
                        await queryClient.invalidateQueries();
                      })();
                    }}
                  >
                    {t('demo.resetYes')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setConfirming(false);
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="mb-4">
            <Button
              variant="secondary"
              onClick={() => {
                void (async () => {
                  await demo.simulateFailedPayment?.();
                  // The account state changed, so anything already loaded is stale.
                  await queryClient.invalidateQueries();
                })();
              }}
            >
              {t('demo.simulateFailedPayment')}
            </Button>
          </div>
          <ul className="m-0 mb-4 flex list-none flex-col gap-2 p-0">
            {later.map((key) => (
              <li key={key} className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" aria-disabled="true" aria-describedby={`${key}-hint`}>
                  {t(key)}
                </Button>
                <span id={`${key}-hint`} className="text-sm">
                  {t('demo.laterBuild')}
                </span>
              </li>
            ))}
          </ul>
          <div role="group" aria-label={t('demo.jumpToPersona')} className="mb-4">
            <p className="mt-0 mb-1 font-semibold">{t('demo.jumpToPersona')}</p>
            {personas === null ? (
              <p className="m-0">{t('demo.personaLoading')}</p>
            ) : (
              (['client', 'staff'] as const).map((side) => (
                <div key={side} className="mb-2">
                  <p className="mt-0 mb-1 text-sm">
                    {t(side === 'client' ? 'demo.personaClientAdmins' : 'demo.personaStaff')}
                  </p>
                  <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                    {personas
                      .filter((p) => p.side === side)
                      .map((p) => (
                        <li key={p.userId}>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              jumpToPersona(p);
                            }}
                          >
                            {t('demo.personaLabel', { name: p.displayName, client: p.clientName })}
                          </Button>
                        </li>
                      ))}
                  </ul>
                </div>
              ))
            )}
          </div>
          <p className="mt-0 mb-1 font-semibold">{t('demo.jumpTo')}</p>
          <ul className="m-0 mb-2 flex list-none flex-col p-0">
            {jumps.map((j) => (
              <li key={j.to}>
                <Link to={j.to} onClick={close} className={linkClass}>
                  {t(j.label)}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/demo/outbox" onClick={close} className={linkClass}>
                {t('demo.openOutbox')}
              </Link>
            </li>
          </ul>
          <Button variant="quiet" onClick={close}>
            {t('common.close')}
          </Button>
        </>
      ) : null}
    </Dialog>
  );
}
