// ULIDs (build pack 4.2): 48-bit time from the clock plus 80 random bits from the rng,
// Crockford base32, 26 upper-case characters. No ulid package: it reads Math.random and crypto.
import type { Clock } from './clock';
import type { Rng } from './rng';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const ulid = (clock: Clock, rng: Rng): string => {
  let time = clock.now().getTime();
  if (!Number.isInteger(time) || time < 0 || time >= 2 ** 48) throw new Error('Clock time out of ULID range');
  let prefix = '';
  for (let i = 0; i < 10; i++) {
    prefix = ALPHABET.charAt(time % 32) + prefix;
    time = Math.floor(time / 32);
  }
  let random = '';
  for (let i = 0; i < 16; i++) random += ALPHABET.charAt(rng.int(0, 31));
  return prefix + random;
};
