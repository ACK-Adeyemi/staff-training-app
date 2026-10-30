import type { Tour } from './types';

// Build pack 8.2 steps 1 to 7. Step 5 is shown without client scoping (known issue in the M5 plan). The Little Acorns client
// is found by name when Show me is pressed (client ids follow the seed date, so none is written here): the token
// below is replaced by the id of the client whose name starts with the text after the colon.
export const clientNameToken = /\{client:([^}]+)\}/;

export const trackB: Tour = {
  id: 'track-b',
  steps: [
    {
      id: 'b-overview',
      captionKey: 'tour.b.overview',
      persona: 'Provider',
      route: '/provider',
      target: 'provider-overview',
    },
    {
      id: 'b-client',
      captionKey: 'tour.b.client',
      persona: 'Provider',
      route: '/provider/clients/{client:Little Acorns}',
    },
    { id: 'b-support', captionKey: 'tour.b.support', persona: 'Provider', route: '/provider/tickets' },
    { id: 'b-guardrails', captionKey: 'tour.b.guardrails', persona: 'Provider', route: '/provider/dunning' },
    { id: 'b-control', captionKey: 'tour.b.control', persona: 'Provider', route: '/provider/team' },
    { id: 'b-pricing', captionKey: 'tour.b.pricing', persona: 'Provider', route: '/provider/pricing' },
    { id: 'b-security', captionKey: 'tour.b.security', persona: 'Provider', route: '/provider/security' },
  ],
  tryNext: ['tour.b.tryNext1', 'tour.b.tryNext2', 'tour.b.tryNext3'],
};
