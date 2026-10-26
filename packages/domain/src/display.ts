// Display and accessibility settings as pure rules (brief 19.3; plan M2 assumptions 29 to 32).
import type { LearnerPrefs } from './schemas/tenancy';

export const DISPLAY_KEYS = [
  'simpleView',
  'textScale',
  'uiScale',
  'contrast',
  'colourMode',
  'reduceMotion',
  'sound',
  'haptics',
  'readingFont',
  'biggerButtons',
  'spacing',
  'readAloud',
  'readAloudRate',
] as const;
export type DisplayKey = (typeof DISPLAY_KEYS)[number];
export type AppliedDisplayPrefs = Pick<LearnerPrefs, DisplayKey>;
/** A patch: missing and undefined values mean no change. */
export type DisplayPatch = { [K in DisplayKey]?: AppliedDisplayPrefs[K] | undefined };

export const defaultDisplayPrefs: AppliedDisplayPrefs = {
  simpleView: false,
  textScale: 1,
  uiScale: 1,
  contrast: 'standard',
  colourMode: 'auto',
  reduceMotion: false,
  sound: false,
  haptics: true,
  readingFont: 'default',
  biggerButtons: false,
  spacing: 'standard',
  readAloud: true,
  readAloudRate: 1,
};

const TEXT_SCALE = { min: 1, max: 2 };
const UI_SCALE = { min: 1, max: 1.5 };
const SIMPLE_VIEW_MIN_TEXT = 1.25;
const ENUMS: Record<string, readonly unknown[]> = {
  contrast: ['standard', 'high'],
  colourMode: ['auto', 'light', 'dark'],
  readingFont: ['default', 'dyslexiaFriendly'],
  spacing: ['standard', 'wide'],
  readAloudRate: [0.75, 1, 1.25, 1.5],
};
const BOOLEANS = ['simpleView', 'reduceMotion', 'sound', 'haptics', 'biggerButtons', 'readAloud'];

const inRange = (v: unknown, r: { min: number; max: number }): boolean =>
  typeof v === 'number' && Number.isFinite(v) && v >= r.min && v <= r.max;

export type DisplayValidation = { ok: true } | { ok: false; fields: string[] };

export function validateDisplayPrefs(prefs: DisplayPatch): DisplayValidation {
  const fields: string[] = [];
  for (const [key, value] of Object.entries(prefs)) {
    if (value === undefined) continue;
    const valid =
      key === 'textScale'
        ? inRange(value, TEXT_SCALE)
        : key === 'uiScale'
          ? inRange(value, UI_SCALE)
          : BOOLEANS.includes(key)
            ? typeof value === 'boolean'
            : key in ENUMS
              ? (ENUMS[key] as readonly unknown[]).includes(value)
              : false;
    if (!valid) fields.push(key);
  }
  return fields.length === 0 ? { ok: true } : { ok: false, fields };
}

export function mergeDisplayPrefs(base: AppliedDisplayPrefs | undefined, patch: DisplayPatch): AppliedDisplayPrefs {
  const out: Record<string, unknown> = { ...defaultDisplayPrefs, ...base };
  for (const [key, value] of Object.entries(patch)) if (value !== undefined) out[key] = value;
  return out as AppliedDisplayPrefs;
}

const clamp = (v: number, r: { min: number; max: number }): number =>
  Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : r.min;

export type DisplayAttributes = { attributes: Record<string, string>; variables: Record<string, string> };

/** What to put on the html element. Simple view is applied here and never written back to the saved prefs. */
export function displayAttributes(prefs: DisplayPatch): DisplayAttributes {
  const p = mergeDisplayPrefs(undefined, prefs);
  const text = clamp(p.textScale, TEXT_SCALE);
  const wide = p.spacing === 'wide';
  return {
    attributes: {
      'data-contrast': p.contrast,
      'data-colour-mode': p.colourMode,
      'data-reading-font': p.readingFont,
      'data-spacing': p.spacing,
      'data-reduce-motion': String(p.reduceMotion || p.simpleView),
      'data-simple-view': String(p.simpleView),
      'data-bigger-buttons': String(p.biggerButtons),
    },
    variables: {
      '--text-scale': String(p.simpleView ? Math.max(text, SIMPLE_VIEW_MIN_TEXT) : text),
      '--ui-scale': String(clamp(p.uiScale, UI_SCALE)),
      '--touch-target': p.biggerButtons ? '56px' : '44px',
      '--line-height': wide ? '1.8' : '1.5',
      '--letter-spacing': wide ? '0.05em' : '0em',
      '--word-spacing': wide ? '0.1em' : '0em',
    },
  };
}
