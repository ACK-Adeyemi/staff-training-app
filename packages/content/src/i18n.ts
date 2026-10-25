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
}

const defaultStrict = (): boolean => (import.meta as { env?: { MODE?: string } }).env?.MODE !== 'production';

const lookup = (messages: unknown, key: string): string | undefined => {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object' || !Object.hasOwn(node, part)) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
};

export function createT(messages: Messages, options: CreateTOptions = {}): TFunction {
  const strict = options.strict ?? defaultStrict();
  return (key, params) => {
    const template = lookup(messages, key);
    if (template === undefined) {
      if (strict) throw new Error(`Unknown message key: ${key}`);
      return key;
    }
    // One pass, so inserted values are literal and never re-interpolated.
    return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (placeholder, name: string) => {
      if (params && Object.hasOwn(params, name)) return String(params[name]);
      if (strict) throw new Error(`Missing parameter "${name}" for message key: ${key}`);
      return placeholder;
    });
  };
}

export const languages = {
  'en-GB': { label: 'English (UK)', messages: enGB },
} as const;

export type LanguageCode = keyof typeof languages;
