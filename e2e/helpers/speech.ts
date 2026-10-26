// Replaces speechSynthesis with a recorder that exposes one local voice (M2 chunk 12). Install before page load.
import type { Page } from '@playwright/test';

export type SpeechLog = {
  spoken: { text: string; rate: number; lang: string; localService: boolean }[];
  pauses: number;
  resumes: number;
  cancels: number;
};

export async function installSpeechRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log = { spoken: [] as unknown[], pauses: 0, resumes: 0, cancels: 0 };
    const voice = { name: 'Test voice', lang: 'en-GB', localService: true, default: true, voiceURI: 'test-voice' };
    class FakeUtterance {
      text: string;
      rate = 1;
      lang = '';
      voice: unknown = null;
      onend: (() => void) | null = null;
      onboundary: ((e: unknown) => void) | null = null;
      constructor(text = '') {
        this.text = text;
      }
    }
    const synth = {
      speaking: false,
      paused: false,
      getVoices: () => [voice],
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      speak(u: FakeUtterance) {
        log.spoken.push({
          text: u.text,
          rate: u.rate,
          lang: u.lang,
          localService: (u.voice as typeof voice | null)?.localService ?? true,
        });
        synth.speaking = true;
      },
      pause() {
        log.pauses += 1;
        synth.paused = true;
      },
      resume() {
        log.resumes += 1;
        synth.paused = false;
      },
      cancel() {
        log.cancels += 1;
        synth.speaking = false;
      },
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
    (window as unknown as { __speech: typeof log }).__speech = log;
  });
}

export async function readSpeechLog(page: Page): Promise<SpeechLog> {
  return page.evaluate(() => (window as unknown as { __speech: SpeechLog }).__speech);
}
