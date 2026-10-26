// The nursery industry pack: terminology, job roles and the M0 requirements. Build pack 2.4 and 9.
import type { IndustryPack, JobRole, Requirement } from '@sta/domain';
import { contentId } from './contentId';
import { moduleIds } from './moduleIds';

const packId = contentId(101);

const jobRole = (n: number, name: string): JobRole => ({ id: contentId(500 + n), packId, name });

const jobRoles: JobRole[] = [
  jobRole(1, 'Nursery Manager'),
  jobRole(2, 'Deputy Manager'),
  jobRole(3, 'Designated Safeguarding Lead'),
  jobRole(4, 'Room Leader'),
  jobRole(5, 'Practitioner'),
  jobRole(6, 'Apprentice'),
  jobRole(7, 'Cook'),
  jobRole(8, 'Bank Practitioner'),
];

const cook = jobRoles.find((r) => r.name === 'Cook') as JobRole;

// VERIFY: every renewEveryMonths value below is a placeholder. Safeguarding refreshers (24 months), paediatric first aid
// (36 months, EYFS certificate validity) and food hygiene (36 months, a common employer choice rather than a legal limit)
// must be checked against the EYFS statutory framework, DfE guidance and HSE/FSA guidance before real use.
const requirements: Requirement[] = [
  {
    id: contentId(601),
    packId,
    name: 'Safeguarding',
    appliesTo: { all: true },
    renewEveryMonths: 24, // VERIFY
    evidence: ['module', 'external'],
    satisfiedByModuleIds: [moduleIds.safeguardingAndWhistleblowing],
    sourceRef: 'EYFS statutory framework (DfE), safeguarding section',
    acceptsExternal: true,
    acceptedProviders: [],
    expiryMode: 'fromRenewalPeriod',
    approverChecklist: [],
  },
  {
    id: contentId(602),
    packId,
    name: 'Paediatric first aid',
    appliesTo: { all: true },
    renewEveryMonths: 36, // VERIFY
    evidence: ['module', 'external'],
    satisfiedByModuleIds: [moduleIds.paediatricFirstAid],
    sourceRef: 'EYFS statutory framework (DfE), first aid section',
    acceptsExternal: true,
    acceptedProviders: [],
    expiryMode: 'fromCertificate',
    approverChecklist: [],
  },
  {
    id: contentId(603),
    packId,
    name: 'Food hygiene',
    appliesTo: { jobRoleIds: [cook.id] },
    renewEveryMonths: 36, // VERIFY
    evidence: ['module', 'external'],
    satisfiedByModuleIds: [moduleIds.foodHygiene],
    sourceRef: 'Food Standards Agency guidance for food handlers',
    acceptsExternal: true,
    acceptedProviders: [],
    expiryMode: 'fromRenewalPeriod',
    approverChecklist: [],
  },
  {
    id: contentId(604),
    packId,
    name: 'What changed in September 2026',
    appliesTo: { all: true },
    evidence: ['module'],
    satisfiedByModuleIds: [moduleIds.whatChangedSeptember2026],
    sourceRef: 'DfE EYFS update',
    acceptsExternal: false,
    acceptedProviders: [],
    expiryMode: 'fromRenewalPeriod',
    approverChecklist: [],
  },
  {
    id: contentId(605),
    packId,
    name: 'New starter induction',
    appliesTo: { all: true },
    evidence: ['module'],
    satisfiedByModuleIds: [moduleIds.newStarterInduction],
    acceptsExternal: false,
    acceptedProviders: [],
    expiryMode: 'fromRenewalPeriod',
    approverChecklist: [],
  },
];

export const nurseryPack: IndustryPack = {
  id: packId,
  name: 'Nurseries and early years',
  status: 'full',
  terminology: {
    site: 'setting',
    team: 'room',
    auditExport: 'Inspector-ready',
    inspector: 'Ofsted inspector',
  },
  jobRoles,
  requirements,
  defaultCategoryIds: [],
  defaultRules: [],
  faqIds: [],
  supportFeatureIds: [],
  prizeSuggestions: ['Extra break', 'Choose the next team treat', 'Early finish on a quiet day'],
};
