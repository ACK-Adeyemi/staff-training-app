// Sound and haptics on a celebration (plan assumption 30). Both do nothing where the device cannot do them.
import type { AppliedDisplayPrefs } from '@sta/domain';

type AudioCtor = new () => {
  createOscillator: () => {
    frequency: { value: number };
    connect: (n: unknown) => void;
    start: (t?: number) => void;
    stop: (t?: number) => void;
  };
  createGain: () => { gain: { value: number }; connect: (n: unknown) => void };
  destination: unknown;
  currentTime: number;
  close: () => Promise<void>;
};

export function celebrate(prefs: Pick<AppliedDisplayPrefs, 'sound' | 'haptics'>): void {
  if (typeof window === 'undefined') return;
  if (prefs.haptics && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(30);
  }
  if (prefs.sound) {
    const Ctor = (window as unknown as { AudioContext?: AudioCtor }).AudioContext;
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      const tone = ctx.createOscillator();
      const gain = ctx.createGain();
      tone.frequency.value = 660;
      gain.gain.value = 0.1;
      tone.connect(gain);
      gain.connect(ctx.destination);
      tone.start(ctx.currentTime);
      tone.stop(ctx.currentTime + 0.2);
      setTimeout(() => {
        void ctx.close().catch(() => undefined);
      }, 400);
    } catch {
      // Sound is optional.
    }
  }
}
