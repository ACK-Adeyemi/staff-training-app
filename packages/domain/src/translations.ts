// Language versions of a module (plan M5, F-5). A translation points at its original with translatedFrom.
import type { Module } from './schemas/learning';

const published = (m: Module): boolean => m.status === 'published';

/** The other published language versions of the same content, in the order given. */
export function translationsFor(moduleId: string, modules: Module[]): Module[] {
  const self = modules.find((m) => m.id === moduleId);
  if (!self) return [];
  const originalId = self.translatedFrom?.moduleId ?? self.id;
  return modules.filter(
    (m) => m.id !== moduleId && published(m) && (m.id === originalId || m.translatedFrom?.moduleId === originalId),
  );
}

/** The version to open by default: the first with exactly this language, else the module itself. */
export function preferredVersion(module: Module, translations: Module[], language: string): Module {
  return [module, ...translations].find((m) => m.language === language && (m === module || published(m))) ?? module;
}
