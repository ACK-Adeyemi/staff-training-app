import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';

export interface SpeechAdapter {
  speak: (text: string, opts: { rate: number; onEnd: () => void }) => void;
  stop: () => void;
}
export interface ReadAloudLabels {
  play: string;
  pause: string;
  speed: string;
  previous: string;
  next: string;
}
export interface ReadAloudBarProps {
  paragraphs: string[];
  speech: SpeechAdapter;
  labels: ReadAloudLabels;
  rates: number[];
  /** Text for a speed option, for example "1.25x". Defaults to the number. */
  rateLabel?: (rate: number) => string;
  /** Render only the controls, not the paragraph text. */
  controlsOnly?: boolean;
  /** Called whenever the current paragraph changes. */
  onIndexChange?: (index: number) => void;
  /** The starting speed; one of `rates`. */
  defaultRate?: number;
  /** Called with true each time speech starts. */
  onPlayingChange?: (playing: boolean) => void;
}

export function ReadAloudBar({
  paragraphs,
  speech,
  labels,
  rates,
  rateLabel = String,
  controlsOnly = false,
  onIndexChange,
  defaultRate,
  onPlayingChange,
}: ReadAloudBarProps) {
  const [index, setIndexState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(
    defaultRate !== undefined && rates.includes(defaultRate) ? defaultRate : rates.includes(1) ? 1 : (rates[0] ?? 1),
  );
  const onIndexRef = useRef(onIndexChange);
  useEffect(() => {
    onIndexRef.current = onIndexChange;
  }, [onIndexChange]);
  const onPlayingRef = useRef(onPlayingChange);
  useEffect(() => {
    onPlayingRef.current = onPlayingChange;
  }, [onPlayingChange]);
  const setIndex = (i: number) => {
    setIndexState(i);
    onIndexRef.current?.(i);
  };
  const speechRef = useRef(speech);
  const token = useRef(0);

  useEffect(() => {
    speechRef.current = speech;
  }, [speech]);
  useEffect(
    () => () => {
      speechRef.current.stop();
    },
    [],
  );

  const speakAt = (i: number, r: number) => {
    const mine = ++token.current;
    setIndex(i);
    setPlaying(true);
    onPlayingRef.current?.(true);
    speechRef.current.speak(paragraphs[i] ?? '', {
      rate: r,
      onEnd: () => {
        if (mine !== token.current) return;
        if (i + 1 < paragraphs.length) speakAt(i + 1, r);
        else setPlaying(false);
      },
    });
  };
  const halt = () => {
    token.current++;
    speechRef.current.stop();
    setPlaying(false);
  };
  const go = (i: number) => {
    if (i < 0 || i >= paragraphs.length) return;
    if (playing) {
      speechRef.current.stop();
      speakAt(i, rate);
    } else setIndex(i);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-2">
        <Button
          variant="secondary"
          disabled={index <= 0}
          onClick={() => {
            go(index - 1);
          }}
        >
          {labels.previous}
        </Button>
        {playing ? (
          <Button onClick={halt}>{labels.pause}</Button>
        ) : (
          <Button
            onClick={() => {
              speakAt(index, rate);
            }}
          >
            <Icon name="bell" />
            {labels.play}
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={index >= paragraphs.length - 1}
          onClick={() => {
            go(index + 1);
          }}
        >
          {labels.next}
        </Button>
        <label className="flex items-center gap-2 font-semibold">
          {labels.speed}
          <select
            value={String(rate)}
            onChange={(e) => {
              const r = Number(e.target.value);
              setRate(r);
              if (playing) {
                speechRef.current.stop();
                speakAt(index, r);
              }
            }}
            className="min-h-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-[var(--color-text)]"
          >
            {rates.map((r) => (
              <option key={r} value={String(r)}>
                {rateLabel(r)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {controlsOnly ? null : (
        <div className="flex flex-col gap-2">
          {paragraphs.map((p, i) => (
            <p
              key={i}
              aria-current={i === index ? 'true' : undefined}
              className={`m-0 rounded-[var(--radius-sm)] p-2 ${i === index ? 'border-s-4 border-[var(--color-accent)] bg-[var(--color-surface)] font-semibold' : 'border-s-4 border-transparent'}`}
            >
              {p}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
