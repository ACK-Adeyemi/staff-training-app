import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Button, ReadAloudBar, parseMarkdown } from '@sta/ui';
import { plainText } from '../../app/speech';
import { useDisplayPrefs } from '../../app/display/context';
import { useSpeech, useT } from '../../app/hooks';

/** English text keeps the default voice choice; any other module language needs a local voice for it. */
export const readAloudLang = (language: string): { lang?: string } => (language === 'en-GB' ? {} : { lang: language });

/** Reads the given text aloud with the chosen speed. Hidden when Read aloud is off; says so when no local voice exists. */
export function ReadAloud({ text, lang, pausable = false }: { text: string; lang?: string; pausable?: boolean }) {
  const t = useT();
  const speech = useSpeech();
  const { prefs } = useDisplayPrefs();
  // The text being read; reading stops showing as soon as the text changes (next step).
  const [readingText, setReadingText] = useState<string | null>(null);
  const available = useSyncExternalStore(
    (cb) => speech.onVoicesChanged(cb),
    () => speech.available(lang),
  );
  const spoken = plainText(text);
  const reading = readingText === spoken;

  // Stop when the text changes (next step) or the page closes.
  useEffect(() => {
    return () => {
      speech.stop();
    };
  }, [spoken, speech]);

  if (!prefs.readAloud) return null;
  if (!available) return <p className="m-0 text-sm">{t('readAloud.unavailable')}</p>;
  if (spoken === '') return null;
  return reading ? (
    <div className="flex flex-wrap gap-2">
      {pausable ? (
        <Button
          variant="secondary"
          onClick={() => {
            speech.stop();
            setReadingText(null);
          }}
        >
          {t('readAloud.pause')}
        </Button>
      ) : null}
      {pausable ? null : (
        <Button
          variant="secondary"
          onClick={() => {
            speech.stop();
            setReadingText(null);
          }}
        >
          {t('readAloud.stop')}
        </Button>
      )}
    </div>
  ) : (
    <Button
      variant="secondary"
      onClick={() => {
        setReadingText(spoken);
        speech.speak(spoken, {
          rate: prefs.readAloudRate,
          ...(lang ? { lang } : {}),
          onEnd: () => {
            setReadingText(null);
          },
        });
      }}
    >
      {t('readAloud.play')}
    </Button>
  );
}

const RATES = [0.75, 1, 1.25, 1.5];

/** One spoken unit per heading, paragraph and bullet of a Markdown text step, in reading order. */
export const readAloudUnits = (markdown: string): string[] =>
  parseMarkdown(markdown).flatMap((b) => (b.kind === 'ul' ? b.items.map(plainText) : [plainText(b.text)]));

/** Read aloud for a lesson text step: previous, play or pause, next and speed. The lesson itself shows the text. */
export function ReadAloudSteps({
  units,
  lang,
  onIndexChange,
  onPlayingChange,
}: {
  units: string[];
  lang?: string;
  onIndexChange: (index: number) => void;
  onPlayingChange: (playing: boolean) => void;
}) {
  const t = useT();
  const speech = useSpeech();
  const { prefs } = useDisplayPrefs();
  const available = useSyncExternalStore(
    (cb) => speech.onVoicesChanged(cb),
    () => speech.available(lang),
  );
  const adapter = useMemo(
    () => ({
      speak: (text: string, o: { rate: number; onEnd: () => void }) => {
        speech.speak(text, { ...o, ...(lang ? { lang } : {}) });
      },
      stop: () => {
        speech.stop();
      },
    }),
    [speech, lang],
  );
  if (!prefs.readAloud) return null;
  if (!available) return <p className="m-0 text-sm">{t('readAloud.unavailable')}</p>;
  if (units.length === 0) return null;
  return (
    <ReadAloudBar
      controlsOnly
      paragraphs={units}
      speech={adapter}
      rates={RATES}
      rateLabel={(r) => `${r}x`}
      defaultRate={prefs.readAloudRate}
      labels={{
        play: t('readAloud.play'),
        pause: t('readAloud.pause'),
        speed: t('readAloud.speed'),
        previous: t('readAloud.previous'),
        next: t('readAloud.next'),
      }}
      onIndexChange={onIndexChange}
      onPlayingChange={onPlayingChange}
    />
  );
}
