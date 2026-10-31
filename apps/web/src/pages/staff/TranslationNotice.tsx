// Language versions on S4 to S6 (plan M5, F-5): the machine translation label and the "Also in" link.
import type { Module } from '@sta/domain';
import type { MessageKey } from '@sta/content';
import { Badge } from '@sta/ui';
import { useT } from '../../app/hooks';
import { focusLink } from './styles';

const languageKey: Record<string, MessageKey> = {
  'en-GB': 'translation.languageEn',
  'pl-PL': 'translation.languagePl',
};

/** The English original of a machine translated module, when there is one among its other versions. */
const englishOf = (module: Module, versions: Module[]): Module | undefined =>
  versions.find((m) => m.id === module.translatedFrom?.moduleId) ?? versions.find((m) => m.language === 'en-GB');

/** Shows "Machine translated" and a link to the official English text on a translated module. */
export function TranslationLabel({ module, versions }: { module: Module; versions: Module[] }) {
  const t = useT();
  if (!module.translatedFrom?.machine) return null;
  const english = englishOf(module, versions);
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Badge>{t('translation.machineTranslated')}</Badge>
      <span>{t('translation.englishIsOfficial')}</span>
      {english ? (
        <a
          href={`#/staff/module/${english.id}`}
          className={`inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`}
        >
          {t('translation.openEnglish')}
        </a>
      ) : null}
    </div>
  );
}

/** "Also in: Polski" with a link to each other language version. */
export function AlsoIn({ versions }: { versions: Module[] }) {
  const t = useT();
  if (versions.length === 0) return null;
  const name = (m: Module): string => {
    const key = languageKey[m.language];
    return key ? t(key) : m.language;
  };
  return (
    <div className="mb-3">
      <p className="m-0">{t('translation.alsoIn', { language: versions.map(name).join(', ') })}</p>
      <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
        {versions.map((m) => (
          <li key={m.id}>
            <a
              href={`#/staff/module/${m.id}`}
              lang={m.language}
              className={`inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`}
            >
              {t('translation.openVersion', { language: name(m) })}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
