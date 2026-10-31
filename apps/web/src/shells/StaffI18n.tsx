import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createT, languages, type LanguageCode, type PartialMessages } from '@sta/content';
import { useActor, useStore } from '../app/hooks';
import { I18nContext, LanguageContext } from '../app/context';

const english = languages['en-GB'].messages;
const englishT = createT(english);
const htmlLang: Record<LanguageCode, string> = { 'en-GB': 'en-GB', 'pl-PL': 'pl' };

/**
 * The staff app's interface language: the learner's saved choice, with the other language loaded on demand and
 * English filling any key it lacks. Until it has loaded, English shows. Client, provider and demo never use this.
 */
export function StaffI18n({ children }: { children: ReactNode }) {
  const store = useStore();
  const actor = useActor();
  // The same query as the Me page, so a change there reaches the whole shell at once.
  const me = useQuery({ queryKey: ['me', actor.userId], queryFn: () => store.me.get(actor) });
  const wanted = me.data?.prefs.language;
  const code: LanguageCode = wanted !== undefined && wanted in languages ? (wanted as LanguageCode) : 'en-GB';
  const [loaded, setLoaded] = useState<{ code: LanguageCode; messages: PartialMessages } | null>(null);

  useEffect(() => {
    if (code === 'en-GB') return undefined;
    const entry = languages[code];
    let live = true;
    void entry
      .load()
      .then((messages) => {
        if (live) setLoaded({ code, messages });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [code]);

  const active: LanguageCode = code !== 'en-GB' && loaded?.code === code ? code : 'en-GB';
  const t = useMemo(
    () => (active === 'en-GB' || !loaded ? englishT : createT(loaded.messages, { fallback: english })),
    [active, loaded],
  );

  useEffect(() => {
    document.documentElement.lang = htmlLang[active];
    return () => {
      document.documentElement.lang = 'en-GB';
    };
  }, [active]);

  return (
    <LanguageContext value={active}>
      <I18nContext value={t}>{children}</I18nContext>
    </LanguageContext>
  );
}
