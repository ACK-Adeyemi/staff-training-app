import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Button, focusClasses } from './Button';

export interface RedactBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface ImageRedactorProps {
  src: string;
  alt: string;
  boxes: RedactBox[];
  onChange: (boxes: RedactBox[]) => void;
  addBoxLabel: string;
  removeBoxLabel: string;
  boxLabel: (n: number) => string;
  helpText: string;
}

const STEP = 0.02;
const MIN = 0.02;
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/** Hide parts of an image with boxes. Boxes are fractions (0 to 1) of the image, so they survive resizing. */
export function ImageRedactor(props: ImageRedactorProps) {
  const { boxes, onChange } = props;
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<RedactBox | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const point = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: clamp((e.clientX - r.left) / (r.width || 1), 0, 1),
      y: clamp((e.clientY - r.top) / (r.height || 1), 0, 1),
    };
  };
  const rectOf = (a: { x: number; y: number }, b: { x: number; y: number }): RedactBox => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  });

  const update = (i: number, box: RedactBox) => {
    onChange(boxes.map((b, j) => (j === i ? box : b)));
  };
  const onBoxKey = (e: KeyboardEvent, i: number) => {
    const dir: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const d = dir[e.key];
    if (!d) return;
    e.preventDefault();
    const b = boxes[i];
    if (!b) return;
    if (e.shiftKey) {
      const w = clamp(b.w + d[0] * STEP, MIN, 1 - b.x);
      const h = clamp(b.h + d[1] * STEP, MIN, 1 - b.y);
      update(i, { ...b, w, h });
    } else {
      update(i, {
        ...b,
        x: clamp(b.x + d[0] * STEP, 0, 1 - b.w),
        y: clamp(b.y + d[1] * STEP, 0, 1 - b.h),
      });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            onChange([...boxes, { x: 0.35, y: 0.35, w: 0.3, h: 0.3 }]);
            setSelected(boxes.length);
          }}
        >
          {props.addBoxLabel}
        </Button>
        <Button
          variant="secondary"
          disabled={boxes.length === 0}
          onClick={() => {
            const i = selected !== null && selected < boxes.length ? selected : boxes.length - 1;
            onChange(boxes.filter((_, j) => j !== i));
            setSelected(null);
          }}
        >
          {props.removeBoxLabel}
        </Button>
      </div>
      <p className="m-0 text-sm text-[var(--color-text-muted)]">{props.helpText}</p>
      <div
        data-testid="redactor-surface"
        className="relative inline-block max-w-full touch-none select-none self-start"
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target !== e.currentTarget && (e.target as HTMLElement).closest('button'))) return;
          const p = point(e);
          start.current = p;
          setDraft({ ...p, w: 0, h: 0 });
          if ('setPointerCapture' in e.currentTarget) e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (start.current) setDraft(rectOf(start.current, point(e)));
        }}
        onPointerUp={(e) => {
          if (!start.current) return;
          const box = rectOf(start.current, point(e));
          start.current = null;
          setDraft(null);
          if (box.w >= MIN && box.h >= MIN) {
            onChange([...boxes, box]);
            setSelected(boxes.length);
          }
        }}
        onPointerCancel={() => {
          start.current = null;
          setDraft(null);
        }}
      >
        <img src={props.src} alt={props.alt} draggable={false} className="block max-h-[70vh] max-w-full" />
        {boxes.map((b, i) => (
          <button
            key={i}
            type="button"
            aria-label={props.boxLabel(i + 1)}
            aria-pressed={selected === i}
            onFocus={() => {
              setSelected(i);
            }}
            onClick={() => {
              setSelected(i);
            }}
            onKeyDown={(e) => {
              onBoxKey(e, i);
            }}
            style={{
              left: `${b.x * 100}%`,
              top: `${b.y * 100}%`,
              width: `${b.w * 100}%`,
              height: `${b.h * 100}%`,
            }}
            className={`absolute min-h-[var(--target-min)] min-w-[var(--target-min)] cursor-move rounded-[var(--radius-sm)] bg-black/70 ${selected === i ? 'border-4 border-dashed border-white' : 'border-2 border-white'} ${focusClasses}`}
          />
        ))}
        {draft ? (
          <div
            aria-hidden="true"
            style={{
              left: `${draft.x * 100}%`,
              top: `${draft.y * 100}%`,
              width: `${draft.w * 100}%`,
              height: `${draft.h * 100}%`,
            }}
            className="pointer-events-none absolute border-2 border-dashed border-white bg-black/50"
          />
        ) : null}
      </div>
    </div>
  );
}
