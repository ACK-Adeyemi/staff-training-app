import { Icon } from './Icon';

export interface CelebrationProps {
  message: string;
  /** Force the static version (Reduce motion or Simple view). When omitted the device preference is used. */
  reducedMotion?: boolean;
}

// Fixed offsets (px) and delays: no randomness, so renders are identical.
const CONFETTI: { x: number; y: number; delay: number; tone: number }[] = [
  { x: -70, y: -50, delay: 0, tone: 1 },
  { x: -45, y: -75, delay: 40, tone: 2 },
  { x: -15, y: -85, delay: 80, tone: 3 },
  { x: 15, y: -85, delay: 20, tone: 4 },
  { x: 45, y: -75, delay: 60, tone: 5 },
  { x: 70, y: -50, delay: 100, tone: 6 },
  { x: -80, y: -15, delay: 120, tone: 7 },
  { x: 80, y: -15, delay: 140, tone: 8 },
];

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

export function Celebration({ message, reducedMotion }: CelebrationProps) {
  const still = reducedMotion ?? prefersReducedMotion();
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div
        className="relative inline-flex h-24 w-24 items-center justify-center text-[var(--status-current)]"
        data-static={still ? 'true' : undefined}
      >
        {still ? (
          <Icon name="check" size={72} />
        ) : (
          <>
            <span aria-hidden="true" className="celebrate-ring absolute inset-0 rounded-full border-4 border-current" />
            <span aria-hidden="true" className="celebrate-tick">
              <Icon name="check" size={72} />
            </span>
            {CONFETTI.map((c, i) => (
              <span
                key={i}
                aria-hidden="true"
                data-confetti=""
                className="celebrate-confetti absolute left-1/2 top-1/2 h-2 w-2 rounded-sm"
                style={{
                  background: `var(--cat-${c.tone}, var(--color-accent))`,
                  ['--dx' as string]: `${c.x}px`,
                  ['--dy' as string]: `${c.y}px`,
                  animationDelay: `${c.delay}ms`,
                }}
              />
            ))}
          </>
        )}
      </div>
      <p aria-live="polite" className="m-0 text-lg font-bold">
        {message}
      </p>
    </div>
  );
}
