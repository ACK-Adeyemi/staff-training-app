// Chunk 6: createT interpolation, missing-key and missing-parameter behaviour, and the languages registry.
import { describe, expect, it } from 'vitest';
import { createT, languages } from './i18n';
import enGB from './lang/en-GB.json' with { type: 'json' };

// Test messages are not the real file, so keys are cast to the real MessageKey type.
const make = (messages: Record<string, unknown>, options?: { strict?: boolean }) => {
  const t = createT(messages as never, options) as unknown as (
    key: string,
    params?: Record<string, string | number>,
  ) => string;
  return t;
};

const msgs = {
  hello: 'Hello',
  greet: 'Hi {name}',
  twice: '{name} and {name}',
  count: 'You have {n} tasks',
  two: '{a} then {b}',
  nested: { deep: { leaf: 'Deep {x}' } },
  braces: 'Use { not a param } here',
};

describe('createT', () => {
  it('returns a plain message unchanged', () => {
    expect(make(msgs)('hello')).toBe('Hello');
  });

  it('resolves nested dot-path keys', () => {
    expect(make(msgs)('nested.deep.leaf', { x: 'one' })).toBe('Deep one');
  });

  it('interpolates a {name} parameter', () => {
    expect(make(msgs)('greet', { name: 'Jade' })).toBe('Hi Jade');
  });

  it('replaces every occurrence of a repeated placeholder', () => {
    expect(make(msgs)('twice', { name: 'Sam' })).toBe('Sam and Sam');
  });

  it('interpolates numbers, including zero', () => {
    expect(make(msgs)('count', { n: 3 })).toBe('You have 3 tasks');
    expect(make(msgs)('count', { n: 0 })).toBe('You have 0 tasks');
  });

  it('interpolates several parameters', () => {
    expect(make(msgs)('two', { a: 'x', b: 'y' })).toBe('x then y');
  });

  it('ignores extra parameters', () => {
    expect(make(msgs)('greet', { name: 'Jade', other: 'unused' })).toBe('Hi Jade');
  });

  it('inserts values literally, without replacement patterns or re-interpolation', () => {
    expect(make(msgs)('greet', { name: '$&' })).toBe('Hi $&');
    expect(make(msgs)('two', { a: '{b}', b: 'y' })).toBe('{b} then y');
  });

  it('leaves braces that are not a plain {word} placeholder alone', () => {
    expect(make(msgs)('braces')).toBe('Use { not a param } here');
  });

  it('throws on a missing parameter in strict mode and names the parameter', () => {
    expect(() => make(msgs, { strict: true })('greet')).toThrow(/name/);
    expect(() => make(msgs, { strict: true })('two', { a: 'x' })).toThrow(/b/);
  });

  it('renders the raw placeholder for a missing parameter in production mode', () => {
    expect(make(msgs, { strict: false })('greet')).toBe('Hi {name}');
    expect(make(msgs, { strict: false })('two', { a: 'x' })).toBe('x then {b}');
  });

  it('is strict by default under Vitest', () => {
    expect(() => make(msgs)('greet')).toThrow(/name/);
  });

  it('throws on an unknown key in strict mode and names the key', () => {
    expect(() => make(msgs, { strict: true })('nope.missing')).toThrow(/nope\.missing/);
  });

  it('throws when a key points at a group rather than a message in strict mode', () => {
    expect(() => make(msgs, { strict: true })('nested.deep')).toThrow(/nested\.deep/);
  });

  it('returns the key itself for an unknown key in production mode', () => {
    expect(make(msgs, { strict: false })('nope.missing')).toBe('nope.missing');
  });

  it('works against the real en-GB messages', () => {
    const t = createT(enGB) as unknown as (k: string) => string;
    expect(typeof t('common.save')).toBe('string');
  });
});

describe('languages registry', () => {
  it('registers en-GB with the real messages', () => {
    expect(languages['en-GB']).toBeDefined();
    expect(languages['en-GB'].messages).toBe(enGB);
  });
});
