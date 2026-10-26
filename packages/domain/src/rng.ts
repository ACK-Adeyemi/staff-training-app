// Seeded random numbers (build pack 4.2). Never use Math.random(); take an Rng instead.
export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  pick<T>(xs: readonly T[]): T;
  /** A shuffled copy; the input is not changed. */
  shuffle<T>(xs: readonly T[]): T[];
  /** n distinct items in random order; the input is not changed. */
  sample<T>(xs: readonly T[], n: number): T[];
  /** An independent stream that depends only on this stream's lineage and the label. */
  fork(label: string): Rng;
}

// cyrb128 string hash giving four 32-bit words.
const hash128 = (str: string): [number, number, number, number] => {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
};

const build = (lineage: string): Rng => {
  let [a, b, c, d] = hash128(lineage);
  // sfc32
  const raw = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 15; i++) raw();

  const rng: Rng = {
    next: raw,
    int(min, max) {
      return min + Math.floor(raw() * (max - min + 1));
    },
    pick(xs) {
      if (xs.length === 0) throw new Error('Cannot pick from an empty array');
      return xs[rng.int(0, xs.length - 1)] as (typeof xs)[number];
    },
    shuffle(xs) {
      const out = [...xs];
      for (let i = out.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [out[i], out[j]] = [out[j] as (typeof out)[number], out[i] as (typeof out)[number]];
      }
      return out;
    },
    sample(xs, n) {
      if (!Number.isInteger(n) || n < 0 || n > xs.length) throw new Error('Sample size out of range');
      return rng.shuffle(xs).slice(0, n);
    },
    fork(label) {
      return build(`${lineage}/${label.length}:${label}`);
    },
  };
  return rng;
};

export const createRng = (seed: number): Rng => build(`seed:${seed}`);
