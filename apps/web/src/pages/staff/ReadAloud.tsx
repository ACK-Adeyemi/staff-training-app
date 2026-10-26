import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@sta/ui';
import { plainText } from '../../app/speech';
import { useDisplayPrefs } from '../../app/display/context';
import { useSpeech, useT } from '../../app/hooks';

/** Reads the given text aloud with the chosen speed. Hidden when Read aloud is off; says so when no local voice exists. */
export function ReadAloud({ text }: { text: string }) {
  const t = useT();
  const speech = useSpeech();
  const { prefs } = useDisplayPrefs();
  // The text being read; reading stops showing as soon as the text changes (next step).
  const [readingText, setReadingText] = useState<string | null>(null);
  const available = useSyncExternalStore(
    (cb) => speech.onVoicesChanged(cb),
    () => speech.available(),
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
    <Button
      variant="secondary"
      onClick={() => {
        speech.stop();
        setReadingText(null);
      }}
    >
      {t('readAloud.stop')}
    </Button>
  ) : (
    <Button
      variant="secondary"
      onClick={() => {
        setReadingText(spoken);
        speech.speak(spoken, {
          rate: prefs.readAloudRate,
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
