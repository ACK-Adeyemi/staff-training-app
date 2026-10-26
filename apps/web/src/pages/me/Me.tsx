import { useState, type SyntheticEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, PageHeader, Switch } from '@sta/ui';
import { ValidationError } from '@sta/data';
import { useActor, useStore, useT } from '../../app/hooks';
import { focusLink } from '../staff/styles';

/** S11. */
export function Me() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ['me', actor.userId], queryFn: () => store.me.get(actor) });
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<'nicknameError' | 'nicknameSaveError' | 'profileSaveError' | null>(null);
  const [saved, setSaved] = useState(false);
  // What is typed in the box; until something is typed it shows the saved nickname.
  const nickname = draft ?? me.data?.nickname ?? '';

  if (me.isError) return <p role="alert">{t('me.loadError')}</p>;
  if (!me.data) return <p>{t('shell.loading')}</p>;
  const hidden = me.data.prefs.hideFromLeaderboards;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['me', actor.userId] });
  const saveNickname = async (e: SyntheticEvent) => {
    e.preventDefault();
    setProblem(null);
    setSaved(false);
    try {
      const trimmed = nickname.trim();
      await store.me.updateProfile(actor, { nickname: trimmed === '' ? null : trimmed });
      await refresh();
      setDraft(null);
      setSaved(true);
    } catch (error) {
      setProblem(error instanceof ValidationError ? 'nicknameError' : 'nicknameSaveError');
    }
  };
  const setHidden = async (value: boolean) => {
    setProblem(null);
    try {
      await store.me.updateProfile(actor, { hideFromLeaderboards: value });
      await refresh();
    } catch {
      setProblem('profileSaveError');
    }
  };

  return (
    <>
      <PageHeader title={t('me.title')} />
      <section aria-labelledby="me-display-name" data-testid="display-name-preview" className="mb-4">
        <Card>
          <h2 id="me-display-name" className="mt-0 mb-1 text-lg font-bold">
            {t('me.displayNameTitle')}
          </h2>
          <p className="m-0 text-xl font-semibold">{me.data.displayName}</p>
          <p className="mb-0">{t('me.displayNameHelp')}</p>
        </Card>
      </section>
      <form
        onSubmit={(e) => {
          void saveNickname(e);
        }}
        className="mb-4 flex flex-col items-start gap-2"
      >
        <label htmlFor="me-nickname" className="font-semibold">
          {t('me.nickname')}
        </label>
        <input
          id="me-nickname"
          type="text"
          value={nickname}
          maxLength={60}
          aria-describedby="me-nickname-help"
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          className="min-h-[var(--target-min)] w-full max-w-sm rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[var(--color-text)] focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        />
        <p id="me-nickname-help" className="m-0 text-sm">
          {t('me.nicknameHelp')}
        </p>
        <Button type="submit">{t('me.saveNickname')}</Button>
        {saved ? <p role="status">{t('me.nicknameSaved')}</p> : null}
      </form>
      {problem ? <p role="alert">{t(`me.${problem}`)}</p> : null}
      <div className="mb-4">
        <Switch
          label={t('me.hideFromLeaderboards')}
          checked={hidden}
          onChange={(value) => {
            void setHidden(value);
          }}
          onLabel={t('display.on')}
          offLabel={t('display.off')}
        />
        <p className="mt-1 text-sm">{t('me.hideHelp')}</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        <li>
          <a
            href="#/staff/me/display"
            className={`inline-flex min-h-[var(--target-min)] items-center text-lg underline ${focusLink}`}
          >
            {t('me.displayLink')}
          </a>
        </li>
        <li>
          <a
            href="#/staff/notifications"
            className={`inline-flex min-h-[var(--target-min)] items-center text-lg underline ${focusLink}`}
          >
            {t('me.notificationsLink')}
          </a>
        </li>
      </ul>
    </>
  );
}
