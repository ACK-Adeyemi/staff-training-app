// Nursery default categories (M2 plan assumption 35) and the module-to-category map.
import type { CategoryColour, CategoryIcon } from '@sta/domain';
import { moduleIds } from '../moduleIds';

export interface NurseryCategory {
  key: string;
  name: string;
  colour: CategoryColour;
  icon: CategoryIcon;
}

export const nurseryCategories: readonly NurseryCategory[] = [
  { key: 'safeguarding', name: 'Safeguarding', colour: 'purple', icon: 'bell' },
  { key: 'healthAndSafety', name: 'Health and safety', colour: 'rose', icon: 'alert' },
  { key: 'foodAndNutrition', name: 'Food and nutrition', colour: 'green', icon: 'check' },
  { key: 'sleepAndWellbeing', name: 'Sleep and wellbeing', colour: 'blue', icon: 'clock' },
  { key: 'induction', name: 'Induction', colour: 'amber', icon: 'user' },
  { key: 'ourPolicies', name: 'Our policies', colour: 'slate', icon: 'book' },
];

export const nurseryModuleCategory: Readonly<Record<string, string>> = {
  [moduleIds.safeguardingAndWhistleblowing]: 'safeguarding',
  [moduleIds.whatChangedSeptember2026]: 'safeguarding',
  [moduleIds.paediatricFirstAid]: 'healthAndSafety',
  [moduleIds.safeEatingAllergiesAndChoking]: 'foodAndNutrition',
  [moduleIds.saferSleep]: 'sleepAndWellbeing',
  [moduleIds.suitablePeople]: 'safeguarding',
  [moduleIds.ratios]: 'healthAndSafety',
  [moduleIds.riskAssessment]: 'healthAndSafety',
  [moduleIds.medicines]: 'healthAndSafety',
  [moduleIds.records]: 'ourPolicies',
};
