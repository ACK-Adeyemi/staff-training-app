// C26 Sign in and two-step sign-in (brief 22.6; M3 assumptions 3 and 4). Demo only: any email and password work.
import { useState, type SyntheticEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { MessageKey } from '@sta/content';
import { Button, CodeInput, PageHeader, QrCode } from '@sta/ui';
import { RuleError } from '@sta/data';
import type { TwoFactorStatus } from '@sta/domain';
import { useActor, useStore, useT } from '../../app/hooks';
import { Standalone } from '../pages';
import { foundationsErrorKey, inputClass } from './foundationsErrors';
import { useTwoFactorStatus } from './foundationsQueries';

type Step = 'credentials' | 'code' | 'recovery' | 'start' | 'enrol' | 'codes';

function firstStep(status: TwoFactorStatus, setup: boolean): Step {
  const unenrolled = status.kind === 'grace' || status.kind === 'limited';
  if (setup && unenrolled) return 'start';
  return 'credentials';
}

/** The words that differ between the client and provider sign in pages; the rest of the flow is shared. */
export type SignInCopy = {
  title: MessageKey;
  demoOnly: MessageKey;
  email: MessageKey;
  password: MessageKey;
  signIn: MessageKey;
  intro: MessageKey;
  code: MessageKey;
  confirm: MessageKey;
  useRecovery: MessageKey;
  useAppCode: MessageKey;
  recoveryLabel: MessageKey;
  wrong: MessageKey;
  locked: MessageKey;
};

const clientCopy: SignInCopy = {
  title: 'twoFactor.title',
  demoOnly: 'twoFactor.demoOnly',
  email: 'twoFactor.email',
  password: 'twoFactor.password',
  signIn: 'twoFactor.signIn',
  intro: 'twoFactor.intro',
  code: 'twoFactor.code',
  confirm: 'twoFactor.confirm',
  useRecovery: 'twoFactor.useRecovery',
  useAppCode: 'twoFactor.useAppCode',
  recoveryLabel: 'twoFactor.recoveryCodeLabel',
  wrong: 'twoFactor.wrong',
  locked: 'twoFactor.locked',
};

/** Where to go once the person is in: the client dashboard. */
export function SignIn() {
  return <TwoFactorSignIn destination="/client" copy={clientCopy} />;
}

/** The sign in and two-step flow shared by the client (C26) and provider (P23) pages. */
export function TwoFactorSignIn({ destination, copy }: { destination: string; copy: SignInCopy }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const status = useTwoFactorStatus();
  const [step, setStep] = useState<Step | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [enrolment, setEnrolment] = useState<{ secret: string; uri: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  if (status.isError)
    return (
      <Standalone>
        <p role="alert">{t('twoFactor.loadError')}</p>
      </Standalone>
    );
  if (!status.data)
    return (
      <Standalone>
        <p>{t('shell.loading')}</p>
      </Standalone>
    );
  const tf = status.data;
  const current = step ?? firstStep(tf, params.get('setup') === '1');

  const go = (next: Step) => {
    setProblem(null);
    setCode('');
    setStep(next);
  };
  const finish = () => {
    void navigate(destination);
  };
  const fail = (e: unknown) => {
    if (e instanceof RuleError && (e.rule === 'wrongCode' || e.rule === 'codeLocked')) {
      setProblem(t(e.rule === 'codeLocked' ? copy.locked : copy.wrong));
    } else {
      setProblem(t(foundationsErrorKey(e)));
    }
  };

  const signIn = (e: SyntheticEvent) => {
    e.preventDefault();
    const kind = tf.kind;
    if (kind === 'enrolled') go('code');
    else if (kind === 'notRequired') finish();
    else go('start');
  };
  const start = () => {
    void (async () => {
      try {
        setEnrolment(await store.twoFactor.startEnrolment(actor));
        go('enrol');
      } catch (e) {
        fail(e);
      }
    })();
  };
  const confirm = (e: SyntheticEvent) => {
    e.preventDefault();
    void (async () => {
      try {
        if (current === 'enrol') {
          const done = await store.twoFactor.confirmEnrolment(actor, code);
          setRecoveryCodes(done.recoveryCodes);
          // Refresh now, so the client shell already knows the admin is enrolled when they carry on.
          await queryClient.invalidateQueries();
          go('codes');
        } else {
          if (current === 'recovery') await store.twoFactor.useRecoveryCode(actor, recovery);
          else await store.twoFactor.verify(actor, code);
          finish();
        }
      } catch (err) {
        fail(err);
      }
    })();
  };
  const alert = problem ? (
    <p role="alert" className="m-0 font-semibold">
      {problem}
    </p>
  ) : null;

  return (
    <Standalone>
      <PageHeader title={t(copy.title)} />
      {current === 'credentials' ? (
        <form onSubmit={signIn} className="flex flex-col gap-4">
          <p className="m-0">{t(copy.demoOnly)}</p>
          <div className="flex flex-col gap-1">
            <label htmlFor="c26-email" className="font-semibold">
              {t(copy.email)}
            </label>
            <input
              id="c26-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="c26-password" className="font-semibold">
              {t(copy.password)}
            </label>
            <input
              id="c26-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
              className={inputClass}
            />
          </div>
          <div>
            <Button type="submit">{t(copy.signIn)}</Button>
          </div>
        </form>
      ) : null}

      {current === 'code' || current === 'recovery' ? (
        <form onSubmit={confirm} className="flex flex-col gap-4">
          <p className="m-0">{t(copy.intro)}</p>
          {current === 'code' ? (
            <CodeInput label={t(copy.code)} value={code} onChange={setCode} />
          ) : (
            <div className="flex flex-col gap-1">
              <label htmlFor="c26-recovery" className="font-semibold">
                {t(copy.recoveryLabel)}
              </label>
              <input
                id="c26-recovery"
                type="text"
                autoComplete="off"
                value={recovery}
                onChange={(e) => {
                  setRecovery(e.target.value);
                }}
                className={inputClass}
              />
            </div>
          )}
          {alert}
          <div className="flex flex-wrap gap-2">
            <Button type="submit">{t(copy.confirm)}</Button>
            <Button
              variant="quiet"
              onClick={() => {
                go(current === 'code' ? 'recovery' : 'code');
              }}
            >
              {current === 'code' ? t(copy.useRecovery) : t(copy.useAppCode)}
            </Button>
          </div>
          <p className="m-0 text-sm">{t('twoFactor.demoNote')}</p>
        </form>
      ) : null}

      {current === 'start' ? (
        <div className="flex flex-col gap-4">
          <p className="m-0">{tf.kind === 'limited' ? t('twoFactor.limited') : t('twoFactor.setupIntro')}</p>
          {alert}
          <div>
            <Button onClick={start}>{t('twoFactor.start')}</Button>
          </div>
        </div>
      ) : null}

      {current === 'enrol' && enrolment ? (
        <form onSubmit={confirm} className="flex flex-col gap-4">
          <p className="m-0">{t('twoFactor.scan')}</p>
          <QrCode
            value={enrolment.uri}
            alt={t('twoFactor.qrAlt')}
            textAlternative={t('twoFactor.secret', { secret: enrolment.secret })}
          />
          <CodeInput label={t(copy.code)} value={code} onChange={setCode} />
          {alert}
          <div>
            <Button type="submit">{t(copy.confirm)}</Button>
          </div>
          <p className="m-0 text-sm">{t('twoFactor.demoNote')}</p>
        </form>
      ) : null}

      {current === 'codes' ? (
        <section aria-labelledby="c26-codes" className="flex flex-col gap-4">
          <h2 id="c26-codes" className="m-0 text-xl font-bold">
            {t('twoFactor.recovery.title')}
          </h2>
          <p className="m-0">{t('twoFactor.recovery.intro')}</p>
          <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 font-mono text-lg">
            {recoveryCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div>
            <Button
              onClick={() => {
                finish();
              }}
            >
              {t('twoFactor.recovery.saved')}
            </Button>
          </div>
        </section>
      ) : null}

      {current === 'credentials' || current === 'code' || current === 'recovery' ? (
        <div className="mt-6">
          <Button
            variant="quiet"
            aria-expanded={helpOpen}
            onClick={() => {
              setHelpOpen((o) => !o);
            }}
          >
            {t('twoFactor.cantAccess')}
          </Button>
          {helpOpen ? (
            <p role="status" className="mt-2 mb-0">
              {t('twoFactor.cantAccessHelp')}
            </p>
          ) : null}
        </div>
      ) : null}
    </Standalone>
  );
}
