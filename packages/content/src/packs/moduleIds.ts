// Stable module ids. The modules themselves arrive in M1; packs refer to them by these constants.
import { contentId } from './contentId';

export const moduleIds = {
  safeguardingAndWhistleblowing: contentId(201),
  paediatricFirstAid: contentId(202),
  safeEatingAllergiesAndChoking: contentId(203),
  whatChangedSeptember2026: contentId(204),
  newStarterInduction: contentId(205),
  foodHygiene: contentId(206),
  saferSleep: contentId(207),
  suitablePeople: contentId(208),
  ratios: contentId(209),
  riskAssessment: contentId(210),
  medicines: contentId(211),
  records: contentId(212),
  saferSleepPl: contentId(213),
} as const;
