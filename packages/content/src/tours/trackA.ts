import type { Tour } from './types';

// Build pack 8.1 steps 1 to 9. Step 10 (Battle Room) joins the tour in M7. The preview route in step 9 uses the
// seeded Safeguarding module and its first lesson (the same ids as the smoke test).
export const trackA: Tour = {
  id: 'track-a',
  steps: [
    {
      id: 'a-dashboard',
      captionKey: 'tour.a.dashboard',
      persona: 'Priya',
      route: '/client',
      target: 'client-dashboard',
    },
    { id: 'a-calendar', captionKey: 'tour.a.calendar', persona: 'Priya', route: '/client/calendar' },
    { id: 'a-staff-jade', captionKey: 'tour.a.staffJade', persona: 'Jade', route: '/staff' },
    { id: 'a-staff-maureen', captionKey: 'tour.a.staffMaureen', persona: 'Maureen', route: '/staff' },
    { id: 'a-evidence', captionKey: 'tour.a.evidence', persona: 'Priya', route: '/client/evidence' },
    { id: 'a-builder', captionKey: 'tour.a.builder', persona: 'Priya', route: '/client/modules/new' },
    { id: 'a-competition', captionKey: 'tour.a.competition', persona: 'Priya', route: '/client/competitions' },
    { id: 'a-sites', captionKey: 'tour.a.sites', persona: 'Fiona', route: '/client/people' },
    {
      id: 'a-ai',
      captionKey: 'tour.a.ai',
      persona: 'Daniel',
      route: '/client/modules/01M0C0N7000000000000000201/preview/lesson-1',
    },
  ],
  tryNext: ['tour.a.tryNext1', 'tour.a.tryNext2', 'tour.a.tryNext3', 'tour.a.tryNext4'],
};
