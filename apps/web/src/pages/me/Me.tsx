import { useState, type SyntheticEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { languages, type LanguageCode } from '@sta/content';
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
  const [problem, setProblem] = useState<
    'nicknameError' | 'nicknameSaveError' | 'profileSaveError' | 'languageSaveError' | null
  >(null);
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

  const language = me.data.prefs.language in languages ? (me.data.prefs.language as LanguageCode) : 'en-GB';
  const setLanguage = async (value: LanguageCode) => {
    setProblem(null);
    try {
      await store.me.updatePrefs(actor, { language: value });
      await refresh();
    } catch {
      setProblem('languageSaveError');
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
      <section aria-labelledby="me-language" className="mb-4">
        <h2 id="me-language" className="mt-0 mb-1 text-lg font-bold">
          {t('me.languageTitle')}
        </h2>
        <p className="mt-0 mb-2 text-sm">{t('me.languageHelp')}</p>
        <div role="radiogroup" aria-labelledby="me-language" className="flex flex-col gap-2">
          {(Object.keys(languages) as LanguageCode[]).map((code) => (
            <label
              key={code}
              lang={code === 'pl-PL' ? 'pl' : 'en-GB'}
              className="flex min-h-[var(--target-min)] cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] px-3 has-[:focus-visible]:outline-[length:3px] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-focus)]"
            >
              <input
                type="radio"
                name="me-language"
                value={code}
                checked={language === code}
                onChange={() => {
                  void setLanguage(code);
                }}
                className="h-5 w-5 shrink-0 accent-[var(--color-accent)]"
              />
              <span>{languages[code].label}</span>
            </label>
          ))}
        </div>
        {languages[language].machineTranslated ? (
          <p className="mt-2 mb-0 text-sm">{t('me.languageMachineNote')}</p>
        ) : null}
      </section>
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
