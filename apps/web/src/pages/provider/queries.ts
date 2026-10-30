import { useQuery } from '@tanstack/react-query';
import { useActor, useStore } from '../../app/hooks';

export function useProviderOverview() {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: ['providerOverview', actor.userId],
    queryFn: () => store.providerOverview.overview(actor),
  });
}

export function useProviderClients() {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: ['providerClients', actor.userId],
    queryFn: () => store.providerOverview.clients(actor),
  });
}

export function useClientTelemetry(clientId: string) {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: ['providerTelemetry', actor.userId, clientId],
    queryFn: () => store.telemetry.simulated(actor, clientId),
  });
}

export function useLocalTelemetry() {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: ['providerLocalTelemetry', actor.userId],
    queryFn: () => store.telemetry.listLocal(actor),
  });
}
