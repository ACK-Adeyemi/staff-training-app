// Typed message lookup with {name} interpolation. Build pack plan M0, Content package.
import enGB from './lang/en-GB.json';

export type Messages = typeof enGB;

type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

export type MessageKey = Paths<Messages>;
export type Params = Record<string, string | number>;
export type TFunction = (key: MessageKey, params?: Params) => string;

export interface CreateTOptions {
  /** Throw on an unknown key or a missing parameter. Defaults to true except in a production build. */
  strict?: boolean;
  /** Messages used when a key is missing from `messages` (the en-GB set, for a partial translation). */
  fallback?: Messages;
}

/** A translation may cover only some keys. */
export type PartialMessages<T = Messages> = { [K in keyof T]?: T[K] extends string ? string : PartialMessages<T[K]> };

const defaultStrict = (): boolean => (import.meta as { env?: { MODE?: string } }).env?.MODE !== 'production';

const lookup = (messages: unknown, key: string): string | undefined => {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object' || !Object.hasOwn(node, part)) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
};

export function createT(messages: Messages | PartialMessages, options: CreateTOptions = {}): TFunction {
  const strict = options.strict ?? defaultStrict();
  return (key, params) => {
    const own = lookup(messages, key);
    const template = own ?? (options.fallback ? lookup(options.fallback, key) : undefined);
    // A missing parameter in an English fallback message must not break a Polish screen, so only the main set is strict.
    const strictParams = strict && own !== undefined;
    if (template === undefined) {
      if (strict) throw new Error(`Unknown message key: ${key}`);
      return key;
    }
    // One pass, so inserted values are literal and never re-interpolated.
    return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (placeholder, name: string) => {
      if (params && Object.hasOwn(params, name)) return String(params[name]);
      if (strictParams) throw new Error(`Missing parameter "${name}" for message key: ${key}`);
      return placeholder;
    });
  };
}

/** Registry order is the order of the picker. Polish loads on demand so English users never download it. */
export const languages = {
  'en-GB': { label: 'English (UK)', machineTranslated: false, messages: enGB },
  'pl-PL': {
    label: 'Polski',
    machineTranslated: true,
    load: async (): Promise<PartialMessages> => (await import('./lang/pl-PL.json')).default,
  },
} as const;

export type LanguageCode = keyof typeof languages;
