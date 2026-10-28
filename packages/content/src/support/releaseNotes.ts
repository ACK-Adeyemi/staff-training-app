// What's new (brief 26.2). Newest first. Text lives in en-GB.json under whatsNew. These are shown to staff too, so they
// never mention billing. Seeded as demo content: the notes and dates are fictional.
export interface ReleaseNote {
  id: string;
  date: string;
  titleKey: string;
  bodyKey: string;
}

export const releaseNotes: ReleaseNote[] = [
  {
    id: 'calendar-reminders',
    date: '2026-10-20',
    titleKey: 'whatsNew.calendarReminders.title',
    bodyKey: 'whatsNew.calendarReminders.body',
  },
  {
    id: 'help-feedback',
    date: '2026-10-06',
    titleKey: 'whatsNew.helpFeedback.title',
    bodyKey: 'whatsNew.helpFeedback.body',
  },
  {
    id: 'september-update',
    date: '2026-09-15',
    titleKey: 'whatsNew.septemberUpdate.title',
    bodyKey: 'whatsNew.septemberUpdate.body',
  },
];
