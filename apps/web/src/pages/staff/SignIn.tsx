import { useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button, ChoiceList, PageHeader } from '@sta/ui';
import { useActor, useDemo, useT } from '../../app/hooks';
import { DEMO_PIN } from '../../demo/pin';
import { Standalone } from '../pages';

type Problem = 'wrongPin' | 'choosePerson' | 'signInError';

/** S1. Shared-device user switch with the demo PIN. */
export function SignIn() {
  const t = useT();
  const demo = useDemo();
  const actor = useActor();
  const navigate = useNavigate();
  const clientId = actor.clientId ?? '';
  const people = useQuery({
    queryKey: ['staffUsers', clientId],
    queryFn: () => demo.listStaffUsers(clientId),
    enabled: clientId !== '',
  });
  const [chosen, setChosen] = useState<string[]>([]);
  const [pin, setPin] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    const userId = chosen[0];
    if (!userId) {
      setProblem('choosePerson');
      return;
    }
    if (pin !== DEMO_PIN) {
      setProblem('wrongPin');
      return;
    }
    setProblem(null);
    try {
      await demo.signInAs(userId);
      await navigate('/staff');
    } catch {
      setProblem('signInError');
    }
  };

  return (
    <Standalone>
      <PageHeader title={t('staff.signin.title')} />
      {people.isError ? <p role="alert">{t('staff.signin.loadError')}</p> : null}
      <form
        onSubmit={(e) => {
          void submit(e);
        }}
        className="flex flex-col gap-4"
        noValidate
      >
        <ChoiceList
          name="person"
          legend={t('staff.signin.who')}
          type="single"
          options={(people.data ?? []).map((p) => ({ id: p.userId, label: p.displayName }))}
          value={chosen}
          onChange={(v) => {
            setChosen(v);
            setProblem(null);
          }}
          stateLabels={{ correct: '', incorrect: '' }}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="staff-pin" className="font-semibold">
            {t('staff.signin.pinLabel')}
          </label>
          <input
            id="staff-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
            }}
            aria-describedby="staff-pin-hint"
            className="min-h-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[var(--color-text)] focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
          />
          <p id="staff-pin-hint" className="m-0 text-sm text-[var(--color-text-muted)]">
            {t('staff.signin.pinHint')}
          </p>
        </div>
        {problem ? (
          <p role="alert" className="m-0 font-semibold">
            {t(`staff.signin.${problem}`)}
          </p>
        ) : null}
        <Button type="submit">{t('staff.signin.submit')}</Button>
      </form>
    </Standalone>
  );
}
