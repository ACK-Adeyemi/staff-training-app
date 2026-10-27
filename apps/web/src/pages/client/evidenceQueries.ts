// Data loading for the evidence screens (C27, first aiders). Reads go through the data layer; rules live in the domain.
import { useQuery } from '@tanstack/react-query';
import { firstAidRequirementKey } from '@sta/content';
import {
  currentFirstAiders,
  londonDateString,
  type Evidence,
  type EvidenceSubmission,
  type FileAttachment,
  type Person,
  type Requirement,
  type Site,
} from '@sta/domain';
import { useActor, useClock, useStore } from '../../app/hooks';
import { orEmpty } from './queries';

/** Submissions waiting for a check in the admin's scope, oldest first, with the names the table needs. */
export function useEvidenceQueue(siteId: string) {
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  return useQuery({
    queryKey: ['evidenceQueue', actor.userId, siteId, londonDateString(clock.now())],
    queryFn: async () => {
      const [queue, people, requirements] = await Promise.all([
        store.evidenceFlow.queue(actor, siteId === 'all' ? undefined : { siteId }),
        orEmpty(store.people.list(actor)),
        store.requirements.list(actor),
      ]);
      return { queue, people, requirements, now: clock.now() };
    },
  });
}

export type ReviewData = {
  submission: EvidenceSubmission;
  requirement: Requirement | undefined;
  person: Person | undefined;
  file: FileAttachment | undefined;
  now: Date;
};

/** One submission with its requirement, person and file. A person or file the viewer may not read is left out. */
export function useSubmissionReview(id: string) {
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  return useQuery({
    queryKey: ['evidenceReview', actor.userId, id],
    queryFn: async (): Promise<ReviewData> => {
      const submission = await store.evidenceFlow.get(actor, id);
      const [requirement, person, file] = await Promise.all([
        store.requirements.get(actor, submission.requirementId).catch(() => undefined),
        store.people.get(actor, submission.personId).catch(() => undefined),
        store.attachments.get(actor, submission.fileAttachmentId).catch(() => undefined),
      ]);
      return {
        submission,
        requirement,
        person,
        file: file?.kind === 'file' ? file : undefined,
        now: clock.now(),
      };
    },
    retry: false,
  });
}

export type FirstAiderRow = { person: Person; evidence: Evidence; approvedBy?: string; approvedAt?: string };
export type FirstAidersData = { sites: Site[]; rows: FirstAiderRow[] };

/** Active people with a current first aid certificate, with who approved an outside certificate and when. */
export function useFirstAiders() {
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  return useQuery({
    queryKey: ['firstAiders', actor.userId, londonDateString(clock.now())],
    queryFn: async (): Promise<FirstAidersData> => {
      const [people, sites, requirements, evidence, submissions, users] = await Promise.all([
        store.people.list(actor),
        store.sites.list(actor),
        store.requirements.list(actor),
        orEmpty(store.evidence.list(actor)),
        orEmpty(store.evidenceSubmissions.list(actor)),
        orEmpty(store.users.list(actor)),
      ]);
      const requirement = requirements.find((r) => r.id === firstAidRequirementKey);
      if (!requirement) return { sites, rows: [] };
      const names = new Map(users.map((u) => [u.id, u.displayName]));
      const rows = currentFirstAiders({ people, sites, requirement, evidence, now: clock.now() }).map((r) => {
        const sub = submissions.find((s) => s.evidenceId === r.evidence.id);
        const by = r.evidence.approvedBy ?? sub?.reviewerId;
        const at = r.evidence.approvedAt ?? sub?.reviewedAt;
        const name = by ? names.get(by) : undefined;
        return {
          ...r,
          ...(name !== undefined ? { approvedBy: name } : {}),
          ...(name !== undefined && at ? { approvedAt: at } : {}),
        };
      });
      return { sites, rows };
    },
  });
}
