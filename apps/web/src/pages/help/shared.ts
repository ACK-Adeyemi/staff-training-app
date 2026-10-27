// Shared helpers for Help, Raise a ticket and the ticket thread (S14 to S16 for staff, C23 for admins).
import { useQuery } from '@tanstack/react-query';
import { can, type Ticket } from '@sta/domain';
import type { MessageKey } from '@sta/content';
import { useActor, useStore } from '../../app/hooks';
import { usePermissions } from '../client/queries';

export type HelpSide = 'staff' | 'client';

export function useHelpSide(): HelpSide {
  return useActor().side === 'client' ? 'client' : 'staff';
}
export const helpPath = (side: HelpSide): string => `/${side}/help`;
export const helpHref = (side: HelpSide, rest = ''): string => `#${helpPath(side)}${rest}`;

/** Admins can always raise tickets. Staff can unless the organisation switched staff tickets off. */
export function useCanRaise(): boolean | undefined {
  const store = useStore();
  const actor = useActor();
  const side = useHelpSide();
  const q = useQuery({
    queryKey: ['supportSettings', actor.userId],
    queryFn: () => store.organisation.supportSettings(actor),
    enabled: side === 'staff',
  });
  if (side === 'client') return true;
  return q.data ? q.data.allowStaffTickets : undefined;
}

export function useCanViewOrgTickets(): boolean {
  const actor = useActor();
  const perms = usePermissions();
  return (
    actor.side === 'client' &&
    actor.clientId !== undefined &&
    can(perms.data ?? [], 'support.viewOrgTickets', { clientId: actor.clientId }, 'read')
  );
}

export function useMyTickets() {
  const store = useStore();
  const actor = useActor();
  return useQuery({ queryKey: ['tickets', 'mine', actor.userId], queryFn: () => store.tickets.list(actor) });
}

export function useOrgTickets(enabled: boolean) {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: ['tickets', 'org', actor.userId],
    queryFn: () => store.tickets.list(actor, { organisation: true }),
    enabled,
  });
}

export const statusKey = (s: Ticket['status']): MessageKey =>
  `tickets.status.${s === 'waitingForCustomer' ? 'waitingForYou' : s}` as MessageKey;

export const isOpen = (t: Ticket): boolean => t.status !== 'resolved' && t.status !== 'closed';
