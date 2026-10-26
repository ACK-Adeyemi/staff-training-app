// Features a person can pick when they raise a ticket (brief 25.3). Labels are en-GB.json keys. "Other" is added by the picker.
// area is the group name used to sort and filter the picker; areaKey is its display label.
export interface SupportFeature {
  id: string;
  labelKey: string;
  iconKey: string;
  area: string;
  areaKey: string;
}

export const supportFeatures: SupportFeature[] = [
  {
    id: 'myTraining',
    labelKey: 'tickets.features.myTraining',
    iconKey: 'BookOpen',
    area: 'learning',
    areaKey: 'tickets.areas.learning',
  },
  {
    id: 'lessons',
    labelKey: 'tickets.features.lessons',
    iconKey: 'Book',
    area: 'learning',
    areaKey: 'tickets.areas.learning',
  },
  {
    id: 'quizzes',
    labelKey: 'tickets.features.quizzes',
    iconKey: 'CheckSquare',
    area: 'quizzes',
    areaKey: 'tickets.areas.quizzes',
  },
  {
    id: 'notes',
    labelKey: 'tickets.features.notes',
    iconKey: 'StickyNote',
    area: 'notes',
    areaKey: 'tickets.areas.notes',
  },
  {
    id: 'competitions',
    labelKey: 'tickets.features.competitions',
    iconKey: 'Trophy',
    area: 'competitions',
    areaKey: 'tickets.areas.competitions',
  },
  {
    id: 'leaderboards',
    labelKey: 'tickets.features.leaderboards',
    iconKey: 'Medal',
    area: 'competitions',
    areaKey: 'tickets.areas.competitions',
  },
  {
    id: 'battleRoom',
    labelKey: 'tickets.features.battleRoom',
    iconKey: 'Swords',
    area: 'battle room',
    areaKey: 'tickets.areas.battleRoom',
  },
  {
    id: 'calendar',
    labelKey: 'tickets.features.calendar',
    iconKey: 'Calendar',
    area: 'calendar',
    areaKey: 'tickets.areas.calendar',
  },
  {
    id: 'certificates',
    labelKey: 'tickets.features.certificates',
    iconKey: 'Award',
    area: 'certificates',
    areaKey: 'tickets.areas.certificates',
  },
  {
    id: 'uploads',
    labelKey: 'tickets.features.uploads',
    iconKey: 'Upload',
    area: 'certificates',
    areaKey: 'tickets.areas.certificates',
  },
  {
    id: 'reports',
    labelKey: 'tickets.features.reports',
    iconKey: 'BarChart',
    area: 'reports',
    areaKey: 'tickets.areas.reports',
  },
  {
    id: 'billing',
    labelKey: 'tickets.features.billing',
    iconKey: 'Receipt',
    area: 'billing',
    areaKey: 'tickets.areas.billing',
  },
  {
    id: 'signIn',
    labelKey: 'tickets.features.signIn',
    iconKey: 'LogIn',
    area: 'login',
    areaKey: 'tickets.areas.login',
  },
  {
    id: 'themes',
    labelKey: 'tickets.features.themes',
    iconKey: 'Palette',
    area: 'themes',
    areaKey: 'tickets.areas.themes',
  },
  {
    id: 'display',
    labelKey: 'tickets.features.display',
    iconKey: 'Eye',
    area: 'themes',
    areaKey: 'tickets.areas.themes',
  },
];
