// Issue types for a ticket (brief 25.3). The picker adds Other. Labels are en-GB.json keys.
export interface IssueType {
  id: string;
  labelKey: string;
}

export const issueTypes: IssueType[] = [
  { id: 'notWorking', labelKey: 'tickets.issueTypes.notWorking' },
  { id: 'cantSignIn', labelKey: 'tickets.issueTypes.cantSignIn' },
  { id: 'howTo', labelKey: 'tickets.issueTypes.howTo' },
  { id: 'contentMistake', labelKey: 'tickets.issueTypes.contentMistake' },
  { id: 'billing', labelKey: 'tickets.issueTypes.billing' },
  { id: 'featureRequest', labelKey: 'tickets.issueTypes.featureRequest' },
  { id: 'accessibility', labelKey: 'tickets.issueTypes.accessibility' },
];
