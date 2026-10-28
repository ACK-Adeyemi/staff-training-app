// Data loading for the billing screens (C19, C20, invoice print view, mock pay page) and Explain this. Reads go through
// the data layer; every query is scoped to the person and the demo day.
import { useQuery } from '@tanstack/react-query';
import { useActor, useStore } from '../../app/hooks';
import { useScopeKey } from './foundationsQueries';

export function useBillingOverview() {
  const store = useStore();
  const actor = useActor();
  return useQuery({ queryKey: useScopeKey('billingOverview'), queryFn: () => store.billing.overview(actor) });
}

export function useInvoices() {
  const store = useStore();
  const actor = useActor();
  return useQuery({ queryKey: useScopeKey('billingInvoices'), queryFn: () => store.billing.invoices(actor) });
}

export function useInvoice(id: string) {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: [...useScopeKey('billingInvoice'), id],
    queryFn: () => store.billing.invoice(actor, id),
  });
}

/** Packages to choose from, and the limits that apply now. */
export function usePlanOptions() {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: useScopeKey('billingPlans'),
    queryFn: async () => {
      const [packages, limits] = await Promise.all([
        store.billing.plans(actor),
        store.competitions.entitlements(actor),
      ]);
      return { packages, limits };
    },
  });
}

/** Every add-on with its state for this organisation and its catalogue price. */
export function useAddOns() {
  const store = useStore();
  const actor = useActor();
  return useQuery({ queryKey: useScopeKey('addOns'), queryFn: () => store.addOns.list(actor) });
}

/** Requests the person may see, with the first names of the people who sent them (when readable). */
export function useAddOnRequests() {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: useScopeKey('addOnRequests'),
    queryFn: async () => {
      const [requests, users] = await Promise.all([
        store.addOnRequests.list(actor),
        store.users.list(actor).catch(() => []),
      ]);
      const names = new Map(users.map((u) => [u.id, u.displayName.split(' ')[0] ?? u.displayName]));
      return requests.map((r) => ({ request: r, firstName: names.get(r.requestedBy) }));
    },
  });
}

/** Which paid features are on for the person's organisation. */
export function useFeatures() {
  const store = useStore();
  const actor = useActor();
  return useQuery({ queryKey: useScopeKey('features'), queryFn: () => store.access.features(actor) });
}
