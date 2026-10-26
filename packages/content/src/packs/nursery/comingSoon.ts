// Roadmap cards for the nursery pack (brief 7, Tier 2 and Tier 3). Shown as coming soon.
export interface ComingSoonTopic {
  id: string;
  tier: 2 | 3;
  titleKey: string;
  categoryKey: string;
}

const topic = (id: string, tier: 2 | 3, categoryKey: string): ComingSoonTopic => ({
  id,
  tier,
  titleKey: `comingSoon.nursery.${id}`,
  categoryKey,
});

export const nurseryComingSoon: readonly ComingSoonTopic[] = [
  topic('suitablePeople', 2, 'safeguarding'),
  topic('ratios', 2, 'healthAndSafety'),
  topic('riskAssessment', 2, 'healthAndSafety'),
  topic('medicines', 2, 'healthAndSafety'),
  topic('records', 2, 'ourPolicies'),
  topic('learningAndDevelopment', 3, 'ourPolicies'),
  topic('assessment', 3, 'ourPolicies'),
  topic('send', 3, 'ourPolicies'),
  topic('behaviour', 3, 'ourPolicies'),
  topic('inductionAndSupervision', 3, 'induction'),
];
