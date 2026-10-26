// The nursery industry pack: terminology, job roles and the M0 requirements. Build pack 2.4 and 9.
import type { AutoAssignRule, IndustryPack, JobRole, Requirement } from '@sta/domain';
import { contentId } from './contentId';
import { moduleIds } from './moduleIds';
import prizes from './nursery/prizes.json';

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
    acceptedProviders: [
      { name: 'DfE early years safeguarding course' },
      { name: 'Local safeguarding partnership level 2 course' },
      { name: 'Approved designated safeguarding lead training provider' },
    ], // VERIFY: fictional or generic provider names
    expiryMode: 'fromRenewalPeriod',
    approverChecklist: [
      // VERIFY: checklist wording
      'The certificate shows the full name of the person and it matches their name on file.',
      'The course covers safeguarding children in the early years, not a different subject.',
      'The date the course was completed is shown and is not in the future.',
      'The training provider is named on the certificate.',
    ],
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
    acceptedProviders: [
      { name: 'Approved paediatric first aid training provider' },
      { name: 'Local authority paediatric first aid course' },
      { name: 'Approved 12-hour paediatric first aid course' },
    ], // VERIFY: fictional or generic provider names
    expiryMode: 'fromCertificate',
    approverChecklist: [
      // VERIFY: checklist wording
      'The certificate shows the full name of the person and it matches their name on file.',
      'The course is a paediatric first aid course covering babies, infants and children.',
      'The date the course was completed is shown, and the certificate is still in date.',
      'The training provider is named, and the course was taught face to face or blended with a practical assessment.',
    ],
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
    acceptedProviders: [
      { name: 'Level 2 food hygiene and safety course' },
      { name: 'Local authority food hygiene course' },
      { name: 'Online level 2 food safety provider' },
    ], // VERIFY: fictional or generic provider names
    expiryMode: 'fromRenewalPeriod',
    approverChecklist: [
      // VERIFY: checklist wording
      'The certificate shows the full name of the person and it matches their name on file.',
      'The course is food hygiene or food safety at level 2 or above.',
      'The date the course was completed is shown and is not in the future.',
      'The training provider is named on the certificate.',
    ],
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

/** The Paediatric first aid requirement id, used by the first aiders forecast. */
export const firstAidRequirementKey: string = contentId(602);

const practitioner = jobRoles.find((r) => r.name === 'Practitioner') as JobRole;

/** Default auto-assign rules (build pack 7.4): a rule without id, clientId or siteId. VERIFY the due dates. */
export type DefaultAutoAssignRule = Omit<AutoAssignRule, 'id' | 'clientId' | 'siteId'> & { key: string };

export const nurseryDefaultRules: DefaultAutoAssignRule[] = [
  {
    key: 'new-starter-induction',
    name: 'New starter induction for new Practitioners',
    enabled: true,
    trigger: { type: 'personAdded' },
    filters: { jobRoleIds: [practitioner.id] },
    action: { moduleId: moduleIds.newStarterInduction },
    dueInDays: 14,
  },
  {
    key: 'safeguarding-refresher',
    name: 'Safeguarding refresher 60 days before expiry',
    enabled: true,
    trigger: { type: 'requirementExpiring', days: 60, requirementId: contentId(601) },
    filters: {},
    action: { moduleId: moduleIds.safeguardingAndWhistleblowing },
    dueInDays: 30,
  },
  {
    key: 'what-changed-september-2026',
    name: 'What changed in September 2026 for everyone',
    enabled: true,
    trigger: { type: 'personAdded' },
    filters: {},
    action: { moduleId: moduleIds.whatChangedSeptember2026 },
    dueInDays: 30,
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
  defaultRules: nurseryDefaultRules,
  faqIds: [],
  supportFeatureIds: [],
  prizeSuggestions: prizes,
};
