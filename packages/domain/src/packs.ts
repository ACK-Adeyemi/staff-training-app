// Pack terminology and requirement applicability. Build pack section 4.2.
import type { IndustryPack, Requirement } from './schemas/packs';
import type { Person, Site } from './schemas/tenancy';

export function term(pack: Pick<IndustryPack, 'terminology'>, key: string, fallback?: string): string {
  return Object.hasOwn(pack.terminology, key) ? (pack.terminology[key] as string) : (fallback ?? key);
}

/** `site` is the person's primary site. Leavers never have requirements apply. */
export function requirementApplies(requirement: Requirement, person: Person, site: Site): boolean {
  if (person.status === 'archived') return false;
  const { all, jobRoleIds, siteAttributes } = requirement.appliesTo;
  if (all === true) return true;
  if (jobRoleIds?.some((r) => person.jobRoleIds.includes(r))) return true;
  if (siteAttributes) {
    const entries = Object.entries(siteAttributes);
    if (entries.length > 0) {
      const attrs = site.attributes ?? {};
      return entries.every(([k, v]) => Object.hasOwn(attrs, k) && attrs[k] === v);
    }
  }
  return false;
}
