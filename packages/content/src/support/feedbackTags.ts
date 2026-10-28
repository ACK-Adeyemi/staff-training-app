// Quick tags on module feedback (brief 19.1). The provider can edit the list later. Labels are en-GB.json keys.
// The data layer relies on the ids 'unclear' and 'mistakeInQuestion'.
export interface FeedbackTag {
  id: string;
  labelKey: string;
}

export const feedbackTags: FeedbackTag[] = [
  { id: 'reallyUseful', labelKey: 'feedback.tags.reallyUseful' },
  { id: 'clear', labelKey: 'feedback.tags.clear' },
  { id: 'unclear', labelKey: 'feedback.tags.unclear' },
  { id: 'tooLong', labelKey: 'feedback.tags.tooLong' },
  { id: 'outOfDate', labelKey: 'feedback.tags.outOfDate' },
  { id: 'mistakeInQuestion', labelKey: 'feedback.tags.mistakeInQuestion' },
  { id: 'notRelevant', labelKey: 'feedback.tags.notRelevant' },
  { id: 'hardOnPhone', labelKey: 'feedback.tags.hardOnPhone' },
];
