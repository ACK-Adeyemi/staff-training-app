// Read aloud through the browser's speech synthesis, using local voices only (plan assumption 31).
// Remote voices could send lesson text off the device, so they are never used.

export interface Speech {
  /** True when this device has at least one local voice. */
  available: () => boolean;
  speak: (text: string, opts: { rate: number; onEnd: () => void }) => void;
  stop: () => void;
  /** Calls back when the list of voices changes; returns an unsubscribe function. */
  onVoicesChanged: (listener: () => void) => () => void;
}

type VoiceLike = { lang: string; localService: boolean };
type SynthLike = {
  getVoices: () => VoiceLike[];
  speak: (utterance: unknown) => void;
  cancel: () => void;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};
type UtteranceCtor = new (text: string) => {
  rate: number;
  lang: string;
  voice: unknown;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

export type SpeechEnv = { synth?: SynthLike | undefined; Utterance?: UtteranceCtor | undefined };

const browserEnv = (): SpeechEnv =>
  typeof window === 'undefined'
    ? {}
    : {
        synth: (window as unknown as { speechSynthesis?: SynthLike }).speechSynthesis,
        Utterance: (window as unknown as { SpeechSynthesisUtterance?: UtteranceCtor }).SpeechSynthesisUtterance,
      };

/** The adapter. Pass an environment in tests; by default it reads the browser's at the time of each call. */
export function createSpeech(env?: SpeechEnv): Speech {
  const get = (): SpeechEnv => env ?? browserEnv();
  const localVoice = (synth: SynthLike): VoiceLike | undefined => {
    const local = synth.getVoices().filter((v) => v.localService);
    return (
      local.find((v) => v.lang.toLowerCase().startsWith('en-gb')) ??
      local.find((v) => v.lang.startsWith('en')) ??
      local[0]
    );
  };
  return {
    available() {
      const { synth, Utterance } = get();
      return Boolean(synth && Utterance && localVoice(synth));
    },
    speak(text, { rate, onEnd }) {
      const { synth, Utterance } = get();
      const voice = synth ? localVoice(synth) : undefined;
      if (!synth || !Utterance || !voice) {
        onEnd();
        return;
      }
      const utterance = new Utterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = rate;
      utterance.onend = onEnd;
      utterance.onerror = onEnd;
      synth.speak(utterance);
    },
    stop() {
      get().synth?.cancel();
    },
    onVoicesChanged(listener) {
      const { synth } = get();
      synth?.addEventListener?.('voiceschanged', listener);
      return () => {
        synth?.removeEventListener?.('voiceschanged', listener);
      };
    },
  };
}

/** Plain text for speaking: markdown marks and link addresses are dropped. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]*(?:[#>]+|[-*+]|\d+\.)[ \t]+/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
