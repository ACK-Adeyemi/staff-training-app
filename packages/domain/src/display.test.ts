// BP-7: display and accessibility settings as pure rules (brief 19.3; plan M2 assumptions 29 to 32).
import { describe, expect, it } from 'vitest';
import { defaultDisplayPrefs, displayAttributes, mergeDisplayPrefs, validateDisplayPrefs } from './display';
import { learnerPrefsSchema } from './schemas/tenancy';

const attrs = (p = {}) => displayAttributes({ ...defaultDisplayPrefs, ...p });

describe('defaultDisplayPrefs (brief 19.3)', () => {
  it('has the documented defaults, with sound off and haptics on', () => {
    expect(defaultDisplayPrefs).toEqual({
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
    });
  });

  it('is a valid set of display prefs', () => {
    expect(validateDisplayPrefs(defaultDisplayPrefs)).toEqual({ ok: true });
  });

  it('an M1-shaped prefs record (no spacing, readAloud, readAloudRate) parses with defaults', () => {
    const m1 = {
      hideFromLeaderboards: false,
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
      language: 'en-GB',
      battleExtraTimePercent: 0,
    };
    const parsed = learnerPrefsSchema.parse(m1);
    expect(parsed.spacing).toBe(defaultDisplayPrefs.spacing);
    expect(parsed.readAloud).toBe(defaultDisplayPrefs.readAloud);
    expect(parsed.readAloudRate).toBe(defaultDisplayPrefs.readAloudRate);
  });
});

describe('validateDisplayPrefs', () => {
  it('accepts the edges: textScale 1 and 2, uiScale 1 and 1.5', () => {
    expect(validateDisplayPrefs({ textScale: 1, uiScale: 1 })).toEqual({ ok: true });
    expect(validateDisplayPrefs({ textScale: 2, uiScale: 1.5 })).toEqual({ ok: true });
  });

  it('refuses textScale outside 1 to 2 and names the field', () => {
    expect(validateDisplayPrefs({ textScale: 0.99 })).toEqual({ ok: false, fields: ['textScale'] });
    expect(validateDisplayPrefs({ textScale: 2.01 })).toEqual({ ok: false, fields: ['textScale'] });
  });

  it('refuses uiScale outside 1 to 1.5', () => {
    expect(validateDisplayPrefs({ uiScale: 0.9 })).toEqual({ ok: false, fields: ['uiScale'] });
    expect(validateDisplayPrefs({ uiScale: 1.51 })).toEqual({ ok: false, fields: ['uiScale'] });
  });

  it('refuses NaN and Infinity', () => {
    expect(validateDisplayPrefs({ textScale: Number.NaN }).ok).toBe(false);
    expect(validateDisplayPrefs({ uiScale: Number.POSITIVE_INFINITY }).ok).toBe(false);
  });

  it('refuses values outside the enums', () => {
    const bad = { contrast: 'extreme', colourMode: 'sepia', readingFont: 'comic', spacing: 'huge' } as never;
    const r = validateDisplayPrefs(bad);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect([...r.fields].sort()).toEqual(['colourMode', 'contrast', 'readingFont', 'spacing']);
  });

  it('accepts only the four read-aloud speeds', () => {
    for (const rate of [0.75, 1, 1.25, 1.5])
      expect(validateDisplayPrefs({ readAloudRate: rate as never }).ok).toBe(true);
    expect(validateDisplayPrefs({ readAloudRate: 2 as never }).ok).toBe(false);
  });

  it('refuses non-boolean switches', () => {
    expect(validateDisplayPrefs({ simpleView: 'yes' as never }).ok).toBe(false);
  });

  it('refuses keys it does not know about', () => {
    expect(validateDisplayPrefs({ hideFromLeaderboards: true } as never)).toMatchObject({ ok: false });
  });
});

describe('mergeDisplayPrefs and reset', () => {
  it('fills from defaults when there is no base', () => {
    expect(mergeDisplayPrefs(undefined, { textScale: 1.5 })).toEqual({ ...defaultDisplayPrefs, textScale: 1.5 });
  });

  it('applies a patch over the base and leaves other settings alone', () => {
    const base = { ...defaultDisplayPrefs, contrast: 'high' as const, textScale: 1.25 };
    expect(mergeDisplayPrefs(base, { colourMode: 'dark' })).toEqual({ ...base, colourMode: 'dark' });
  });

  it('ignores undefined values in the patch', () => {
    const base = { ...defaultDisplayPrefs, textScale: 1.5 };
    expect(mergeDisplayPrefs(base, { textScale: undefined }).textScale).toBe(1.5);
  });

  it('does not mutate the base or the defaults', () => {
    const base = { ...defaultDisplayPrefs };
    mergeDisplayPrefs(base, { sound: true });
    mergeDisplayPrefs(undefined, { sound: true });
    expect(base.sound).toBe(false);
    expect(defaultDisplayPrefs.sound).toBe(false);
  });

  it('reset to defaults is merging the defaults over anything', () => {
    const messy = {
      ...defaultDisplayPrefs,
      textScale: 2,
      uiScale: 1.5,
      contrast: 'high' as const,
      simpleView: true,
      sound: true,
    };
    expect(mergeDisplayPrefs(messy, defaultDisplayPrefs)).toEqual(defaultDisplayPrefs);
  });
});

describe('displayAttributes', () => {
  it('maps contrast, colour mode, reading font and spacing to html data attributes', () => {
    const a = attrs({ contrast: 'high', colourMode: 'dark', readingFont: 'dyslexiaFriendly', spacing: 'wide' });
    expect(a.attributes['data-contrast']).toBe('high');
    expect(a.attributes['data-colour-mode']).toBe('dark');
    expect(a.attributes['data-reading-font']).toBe('dyslexiaFriendly');
    expect(a.attributes['data-spacing']).toBe('wide');
    const d = attrs();
    expect(d.attributes['data-contrast']).toBe('standard');
    expect(d.attributes['data-colour-mode']).toBe('auto');
    expect(d.attributes['data-reading-font']).toBe('default');
    expect(d.attributes['data-spacing']).toBe('standard');
  });

  it('maps reduce motion', () => {
    expect(attrs({ reduceMotion: true }).attributes['data-reduce-motion']).toBe('true');
    expect(attrs().attributes['data-reduce-motion']).toBe('false');
  });

  it('text size is the root scale: 1 to 2 in the text-scale variable', () => {
    expect(attrs().variables['--text-scale']).toBe('1');
    expect(attrs({ textScale: 2 }).variables['--text-scale']).toBe('2');
    expect(attrs({ textScale: 1.5 }).variables['--text-scale']).toBe('1.5');
  });

  it('display zoom goes to the ui-scale variable', () => {
    expect(attrs().variables['--ui-scale']).toBe('1');
    expect(attrs({ uiScale: 1.5 }).variables['--ui-scale']).toBe('1.5');
  });

  it('clamps out-of-range scales rather than emitting them', () => {
    expect(attrs({ textScale: 5 }).variables['--text-scale']).toBe('2');
    expect(attrs({ textScale: 0.2 }).variables['--text-scale']).toBe('1');
    expect(attrs({ uiScale: 3 }).variables['--ui-scale']).toBe('1.5');
    expect(attrs({ uiScale: 0 }).variables['--ui-scale']).toBe('1');
  });

  it('bigger buttons raise the minimum touch target from 44px to 56px', () => {
    expect(attrs().variables['--touch-target']).toBe('44px');
    expect(attrs({ biggerButtons: true }).variables['--touch-target']).toBe('56px');
    expect(attrs({ biggerButtons: true }).attributes['data-bigger-buttons']).toBe('true');
    expect(attrs().attributes['data-bigger-buttons']).toBe('false');
  });

  it('wide reading spacing sets line height 1.8, letter spacing 0.05em, word spacing 0.1em', () => {
    const v = attrs({ spacing: 'wide' }).variables;
    expect(v['--line-height']).toBe('1.8');
    expect(v['--letter-spacing']).toBe('0.05em');
    expect(v['--word-spacing']).toBe('0.1em');
    const s = attrs().variables;
    expect(s['--line-height']).not.toBe('1.8');
    expect(s['--letter-spacing']).toBe('0em');
    expect(s['--word-spacing']).toBe('0em');
  });

  it('simple view sets its attribute, forces at least 125% text, and turns motion off', () => {
    const on = attrs({ simpleView: true });
    expect(on.attributes['data-simple-view']).toBe('true');
    expect(on.variables['--text-scale']).toBe('1.25');
    expect(on.attributes['data-reduce-motion']).toBe('true');
    expect(attrs().attributes['data-simple-view']).toBe('false');
  });

  it('simple view keeps a larger chosen text size', () => {
    expect(attrs({ simpleView: true, textScale: 1.75 }).variables['--text-scale']).toBe('1.75');
  });

  it('simple view does not change the saved prefs (it only changes what is applied)', () => {
    const prefs = { ...defaultDisplayPrefs, simpleView: true };
    displayAttributes(prefs);
    expect(prefs.textScale).toBe(1);
    expect(prefs.reduceMotion).toBe(false);
  });

  it('falls back to defaults for a partial prefs object (device prefs)', () => {
    const a = displayAttributes({ contrast: 'high' });
    expect(a.attributes['data-contrast']).toBe('high');
    expect(a.attributes['data-colour-mode']).toBe('auto');
    expect(a.variables['--text-scale']).toBe('1');
    expect(a.variables['--touch-target']).toBe('44px');
  });

  it('read aloud, sound and haptics are not html attributes (the UI reads prefs directly)', () => {
    const a = attrs({ sound: true, readAloud: false });
    expect(Object.keys(a.attributes).some((k) => /sound|haptic|read-aloud/.test(k))).toBe(false);
  });
});
