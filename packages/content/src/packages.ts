// Packages and add-ons. Brief 20.3 (Option A) and 20.4 (Option B). Limits, bands and prices are placeholders to test.
import type { AddOn, Entitlements, Package } from '@sta/domain';
import { contentId } from './packs/contentId';

export const packageIds = {
  essentials: contentId(301),
  standard: contentId(302),
  group: contentId(303),
  core: contentId(304),
} as const;

export const addOnIds = {
  aiAssistant: contentId(401),
  translation: contentId(402),
  reminders: contentId(403),
  extraContentPack: contentId(404),
  onboarding: contentId(405),
} as const;

/** The floor: what a closed or read-only account falls back to. */
export const floorPackageId = packageIds.essentials;

const essentials: Entitlements = {
  ownModules: 3,
  savedThemes: 1,
  admins: 1,
  autoAssignRules: 2,
  liveCompetitions: 1,
  customClientRoles: 0,
  closedBookCompetitions: false,
  multiSite: false,
  logoBranding: false,
  perSiteThemes: false,
  integrations: false,
  responseTargetHours: 48,
  battlesPerMonth: 2,
  maxBattlePlayers: 10,
  crossSiteBattles: false,
};

const standard: Entitlements = {
  ...essentials,
  ownModules: 'unlimited',
  savedThemes: 5,
  admins: 3,
  autoAssignRules: 'unlimited',
  liveCompetitions: 'unlimited',
  customClientRoles: 3,
  closedBookCompetitions: true,
  responseTargetHours: 24,
  battlesPerMonth: 'unlimited',
  maxBattlePlayers: 30,
};

const group: Entitlements = {
  ...standard,
  customClientRoles: 'unlimited',
  admins: 'unlimited',
  savedThemes: 'unlimited',
  multiSite: true,
  logoBranding: true,
  perSiteThemes: true,
  integrations: true,
  responseTargetHours: 4,
  maxBattlePlayers: 50,
  crossSiteBattles: true,
};

// Option B: the floor plus unlimited own modules, competitions, rules and battles; the rest comes from add-ons.
const core: Entitlements = {
  ...essentials,
  ownModules: 'unlimited',
  savedThemes: 3,
  admins: 3,
  autoAssignRules: 'unlimited',
  liveCompetitions: 'unlimited',
  customClientRoles: 3,
  closedBookCompetitions: true,
  responseTargetHours: 24,
  battlesPerMonth: 'unlimited',
  maxBattlePlayers: 30,
};

// Placeholder bands: up to 15, 16 to 40, 41 or more staff. Prices are per site per month, in pence.
const bands = (small: number, medium: number, large: number): Package['bands'] => [
  { maxStaff: 15, pricePerSite: small },
  { maxStaff: 40, pricePerSite: medium },
  { maxStaff: 200, pricePerSite: large },
];

export const packages: Package[] = [
  {
    id: packageIds.essentials,
    name: 'Essentials',
    option: 'A',
    bands: bands(2500, 4000, 6000),
    entitlements: essentials,
  },
  { id: packageIds.standard, name: 'Standard', option: 'A', bands: bands(3500, 5500, 8000), entitlements: standard },
  { id: packageIds.group, name: 'Group', option: 'A', bands: bands(5000, 7500, 11000), entitlements: group },
  { id: packageIds.core, name: 'Core', option: 'B', bands: bands(3000, 4500, 7000), entitlements: core },
];

export const addOns: AddOn[] = [
  {
    id: addOnIds.aiAssistant,
    name: 'AI Assistant',
    pricing: { kind: 'usage', unit: 'question', pricePerUnit: 5, includedUnits: 200 },
    adds: { flags: ['aiAssistant'] },
  },
  {
    id: addOnIds.translation,
    name: 'Translation of content',
    pricing: { kind: 'flat', price: 1500 },
    adds: { flags: ['translation'] },
  },
  {
    id: addOnIds.reminders,
    name: 'SMS or WhatsApp reminders',
    pricing: { kind: 'usage', unit: 'message', pricePerUnit: 4, includedUnits: 100 },
    adds: { flags: ['smsReminders'] },
  },
  {
    id: addOnIds.extraContentPack,
    name: 'Extra industry content pack',
    pricing: { kind: 'flat', price: 2000 },
    adds: { flags: ['extraContentPack'] },
  },
  {
    id: addOnIds.onboarding,
    name: 'Onboarding or white-label setup',
    pricing: { kind: 'flat', price: 25000 },
    adds: { flags: ['onboarding'] },
  },
];
