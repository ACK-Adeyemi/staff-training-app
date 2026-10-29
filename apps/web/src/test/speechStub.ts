// Test helper (M5 chunk 8): replaces the browser's speech synthesis with a recorder. Not part of the app.
import { vi } from 'vitest';

export type Spoken = { text: string; rate: number; end: () => void };

export function stubSpeech() {
  const spoken: Spoken[] = [];
  const state = { cancels: 0 };
  const voice = { name: 'Test', lang: 'en-GB', localService: true };
  vi.stubGlobal('speechSynthesis', {
    getVoices: () => [voice],
    speak: (u: { text: string; rate: number; onend: (() => void) | null }) =>
      spoken.push({ text: u.text, rate: u.rate, end: () => u.onend?.() }),
    cancel: () => {
      state.cancels += 1;
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      text: string;
      rate = 1;
      lang = '';
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    },
  );
  return { spoken, state };
}
