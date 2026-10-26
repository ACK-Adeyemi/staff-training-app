// Stub packs: a name and terminology only. Luxury retail is a placeholder until M6 upgrades it.
import type { IndustryPack } from '@sta/domain';
import { contentId } from './contentId';
import { nurseryPack } from './nursery';

const stub = (n: number, name: string, terminology: Record<string, string>): IndustryPack => ({
  id: contentId(n),
  name,
  status: 'stub',
  terminology,
  jobRoles: [],
  requirements: [],
  defaultCategoryIds: [],
  defaultRules: [],
  faqIds: [],
  supportFeatureIds: [],
  prizeSuggestions: [],
});

export const stubPacks: IndustryPack[] = [
  stub(102, 'Schools', { site: 'school', team: 'department', auditExport: 'Inspection-ready' }),
  stub(103, 'Social care', { site: 'service', team: 'team', auditExport: 'Inspection-ready' }),
  stub(104, 'Hospitality', { site: 'venue', team: 'section', auditExport: 'Audit-ready' }),
  stub(105, 'Construction', { site: 'site', team: 'crew', auditExport: 'Audit-ready' }),
];

export const luxuryRetailPlaceholder: IndustryPack = stub(106, 'Luxury retail', {
  site: 'boutique',
  team: 'team',
  auditExport: 'Audit-ready',
});

export const allPacks: IndustryPack[] = [nurseryPack, ...stubPacks, luxuryRetailPlaceholder];
