import { trackA } from './trackA';
import { trackB } from './trackB';
import type { Tour } from './types';

export { trackA, trackB };
export type { Tour, TourStep } from './types';
export const tours: readonly Tour[] = [trackA, trackB];
