// M5 chunk 7 (F-5): read-aloud voice follows the language of the text. Plan docs/plans/m5.md F-5 ("Read-aloud picks a local
// voice for the module's language, or shows the existing unavailable message"). Written before the implementation.
//
// API under test (additions to createSpeech):
//   speech.available(lang?: string): boolean   true when a LOCAL voice exists for that language (lang omitted: any, as today)
//   speech.speak(text, { rate, onEnd, lang? })  with lang, uses the best local voice whose lang matches the primary subtag
//     (exact match such as pl-PL first, then any pl-*); sets utterance.voice and utterance.lang to that voice.
//     No local voice for the language: nothing is spoken (an English voice never reads Polish) and onEnd is called at once.
//   Without lang the behaviour is unchanged: en-GB first, then other English, then any local voice.
//   Remote voices are never used, for any language.
import { describe, expect, it } from 'vitest';
import { createSpeech, type SpeechEnv } from './speech';

type V = { lang: string; localService: boolean; name: string };
const en: V = { lang: 'en-GB', localService: true, name: 'English UK' };
const enUs: V = { lang: 'en-US', localService: true, name: 'English US' };
const pl: V = { lang: 'pl-PL', localService: true, name: 'Polish' };
const plRemote: V = { lang: 'pl-PL', localService: false, name: 'Polish remote' };

function env(voices: V[]) {
  const spoken: { text: string; voice: unknown; lang: string }[] = [];
  class Utterance {
    rate = 1;
    lang = '';
    voice: unknown = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public text: string) {}
  }
  const synth = {
    getVoices: () => voices,
    speak: (u: unknown) => {
      const x = u as Utterance;
      spoken.push({ text: x.text, voice: x.voice, lang: x.lang });
    },
    cancel: () => undefined,
  };
  return { spoken, env: { synth, Utterance } as unknown as SpeechEnv };
}
const say = (e: SpeechEnv, text: string, lang?: string) => {
  let ended = 0;
  createSpeech(e).speak(text, { rate: 1, onEnd: () => ended++, ...(lang ? { lang } : {}) });
  return ended;
};

describe('read-aloud voice by language', () => {
  it('speaks Polish with a Polish local voice and tags the utterance pl-PL', () => {
    const { spoken, env: e } = env([en, enUs, pl]);
    say(e, 'Połóż dziecko na plecach.', 'pl-PL');
    expect(spoken).toEqual([{ text: 'Połóż dziecko na plecach.', voice: pl, lang: 'pl-PL' }]);
  });

  it('keeps choosing en-GB first when no language is given', () => {
    const { spoken, env: e } = env([pl, enUs, en]);
    say(e, 'Hello');
    expect(spoken[0]!.voice).toBe(en);
  });

  it('still speaks English with the English voice when the language is en-GB', () => {
    const { spoken, env: e } = env([pl, en]);
    say(e, 'Hello', 'en-GB');
    expect(spoken[0]!.voice).toBe(en);
  });

  it('reports a Polish voice as available only when one is installed', () => {
    expect(createSpeech(env([en]).env).available('pl-PL')).toBe(false);
    expect(createSpeech(env([en, pl]).env).available('pl-PL')).toBe(true);
    expect(createSpeech(env([pl]).env).available('en-GB')).toBe(false);
  });

  it('does not read Polish with an English voice: it says nothing and ends at once', () => {
    const { spoken, env: e } = env([en, enUs]);
    expect(say(e, 'Połóż dziecko na plecach.', 'pl-PL')).toBe(1);
    expect(spoken).toEqual([]);
  });

  it('never uses a remote Polish voice', () => {
    const { spoken, env: e } = env([en, plRemote]);
    expect(createSpeech(e).available('pl-PL')).toBe(false);
    expect(say(e, 'Cześć', 'pl-PL')).toBe(1);
    expect(spoken).toEqual([]);
  });

  it('accepts a Polish voice with a different region tag when no exact match exists', () => {
    const plOther: V = { lang: 'pl', localService: true, name: 'Polish generic' };
    const { spoken, env: e } = env([en, plOther]);
    say(e, 'Cześć', 'pl-PL');
    expect(spoken[0]!.voice).toBe(plOther);
  });
});
