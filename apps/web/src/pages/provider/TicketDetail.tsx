import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { issueTypes, supportFeatures, type MessageKey } from '@sta/content';
import { holdsAnywhere, type Ticket } from '@sta/domain';
import { PageHeader } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';
import { fieldClass } from '../client/feedbackShared';
import { usePermissions } from '../client/queries';
import { useProviderClients } from './queries';

type Shot = { id: string; alt: string; mime: string; data: Uint8Array };

/** One screenshot, shown from a data address made here (no network, nothing to clean up). */
function Screenshot({ shot }: { shot: Shot }) {
  const url = useMemo(() => {
    let binary = '';
    for (const byte of shot.data) binary += String.fromCharCode(byte);
    return `data:${shot.mime};base64,${btoa(binary)}`;
  }, [shot]);
  return (
    <img
      src={url}
      alt={shot.alt}
      className="max-w-full rounded-[var(--radius-md)] border-2 border-[var(--color-border)]"
    />
  );
}

const STATUSES: Ticket['status'][] = ['received', 'inProgress', 'waitingForCustomer', 'resolved', 'closed'];
const btn =
  'min-h-[var(--target-min)] min-w-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] px-4 py-2 font-bold';
const panel = 'mb-4 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4';
const when = (iso: string) => iso.slice(0, 16).replace('T', ' ');

/** P12: one ticket for the provider, with the thread, context, reply, internal notes, status and assignee. */
export function TicketDetail() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const { id = '' } = useParams();
  const perms = usePermissions();
  const canRead = perms.data ? holdsAnywhere(perms.data, 'tickets.read') : false;
  const canWrite = perms.data ? holdsAnywhere(perms.data, 'tickets.write') : false;
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  const list = useQuery({
    queryKey: ['providerTickets', actor.userId, {}],
    queryFn: () => store.providerTickets.list(actor),
    enabled: canRead,
  });
  const messages = useQuery({
    queryKey: ['providerTicketMessages', actor.userId, id],
    queryFn: () => store.providerTickets.messages(actor, id),
    enabled: canRead,
  });
  const screenshots = useQuery({
    queryKey: ['providerTicketScreenshots', actor.userId, id],
    queryFn: () => store.providerTickets.screenshots(actor, id),
    enabled: canRead,
  });
  const raiser = useQuery({
    queryKey: ['providerTicketRaiser', actor.userId, id],
    queryFn: () => store.providerTickets.raiserName(actor, id),
    enabled: canRead,
  });
  const team = useQuery({
    queryKey: ['providerTeam', actor.userId],
    queryFn: () => store.providerTeam.list(actor),
    enabled: canRead,
  });
  const saved = useQuery({
    queryKey: ['savedReplies', actor.userId],
    queryFn: () => store.savedReplies.list(actor),
    enabled: canRead,
  });
  const clients = useProviderClients();

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['providerTickets'] });
    await queryClient.invalidateQueries({ queryKey: ['providerTicketMessages'] });
  };
  const run = <V,>(fn: (v: V) => Promise<unknown>, after?: () => void) => ({
    mutationFn: fn,
    onSuccess: async () => {
      setFailed(false);
      after?.();
      await refresh();
    },
    onError: () => {
      setFailed(true);
    },
  });
  const send = useMutation(
    run(
      (body: string) => store.providerTickets.reply(actor, id, { body }),
      () => {
        setReply('');
      },
    ),
  );
  const addNote = useMutation(
    run(
      (body: string) => store.providerTickets.addNote(actor, id, { body }),
      () => {
        setNote('');
      },
    ),
  );
  const setStatus = useMutation(run((s: Ticket['status']) => store.providerTickets.setStatus(actor, id, s)));
  const assign = useMutation(run((a: string | null) => store.providerTickets.assign(actor, id, a)));
  const insert = useMutation({
    mutationFn: (replyId: string) => store.savedReplies.insertText(actor, replyId, id),
    onSuccess: (text) => {
      setFailed(false);
      setReply(text);
    },
    onError: () => {
      setFailed(true);
    },
  });

  const ticket = list.data?.find((r) => r.ticket.id === id)?.ticket;
  const back = (
    <p>
      <a href="#/provider/tickets" className="inline-flex min-h-[var(--target-min)] items-center underline">
        {t('provider.ticket.back')}
      </a>
    </p>
  );
  const label = (text: string, htmlFor: string) => (
    <label htmlFor={htmlFor} className="font-semibold">
      {text}
    </label>
  );

  if (!perms.data) return <p>{t('shell.loading')}</p>;
  if (!canRead) {
    return (
      <>
        <PageHeader title={t('provider.tickets.heading')} />
        <p role="alert">{t('provider.ticket.noPermission')}</p>
        {back}
      </>
    );
  }
  if (!ticket) {
    return (
      <>
        <PageHeader title={t('provider.tickets.heading')} />
        {list.data ? <p role="alert">{t('provider.ticket.notFound')}</p> : <p>{t('shell.loading')}</p>}
        {back}
      </>
    );
  }

  const feature = supportFeatures.find((f) => f.id === ticket.featureId);
  const issue = issueTypes.find((i) => i.id === ticket.issueTypeId);
  const clientName = clients.data?.find((c) => c.clientId === ticket.clientId)?.displayName ?? ticket.clientId;
  const authorName = (side: 'customer' | 'provider', authorId: string) =>
    side === 'customer'
      ? (raiser.data ?? t('provider.ticket.customerSide'))
      : (team.data?.find((m) => m.userId === authorId)?.name ?? t('provider.ticket.providerSide'));
  const rows: [string, string][] = [
    [t('provider.ticket.client'), clientName],
    [t('provider.ticket.raisedBy'), raiser.data ?? ''],
    [t('provider.ticket.feature'), feature ? t(feature.labelKey as MessageKey) : (ticket.featureOtherText ?? '')],
    [t('provider.ticket.issueType'), issue ? t(issue.labelKey as MessageKey) : (ticket.issueTypeOtherText ?? '')],
    [t('provider.ticket.impact'), t(`provider.tickets.impact.${ticket.impact}` as MessageKey)],
    [t('provider.ticket.status'), t(`provider.tickets.status.${ticket.status}` as MessageKey)],
  ];

  return (
    <>
      {back}
      <PageHeader title={ticket.title} />
      {failed ? <p role="alert">{t('provider.ticket.failed')}</p> : null}
      <section aria-labelledby="ticket-context-h" className={panel}>
        <h2 id="ticket-context-h" className="mt-0 text-lg font-bold">
          {t('provider.ticket.context')}
        </h2>
        <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold">{k}</dt>
              <dd className="m-0">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="ticket-conv-h" className={panel}>
        <h2 id="ticket-conv-h" className="mt-0 text-lg font-bold">
          {t('provider.ticket.conversation')}
        </h2>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {(messages.data ?? []).map((m) => (
            <li
              key={m.id}
              data-testid="ticket-message"
              {...(m.internal ? { 'data-internal': 'true' } : {})}
              className={`rounded-[var(--radius-md)] border-2 p-3 ${m.internal ? 'border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt,transparent)]' : 'border-[var(--color-border)]'}`}
            >
              {m.internal ? <p className="m-0 font-bold">{t('provider.ticket.internalNote')}</p> : null}
              <p className="m-0 text-sm">
                {t('provider.ticket.from', { name: authorName(m.side, m.authorId), time: when(m.createdAt) })}
              </p>
              <p className="m-0 whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>
      </section>
      {screenshots.data && screenshots.data.length > 0 ? (
        <section aria-labelledby="ticket-shots-h" className={panel}>
          <h2 id="ticket-shots-h" className="mt-0 text-lg font-bold">
            {t('provider.ticket.screenshots')}
          </h2>
          <div className="flex flex-col gap-3">
            {screenshots.data.map((shot) => (
              <Screenshot key={shot.id} shot={shot} />
            ))}
          </div>
        </section>
      ) : null}
      {canWrite ? (
        <>
          <section className={`${panel} flex flex-wrap gap-4`}>
            <div className="flex flex-col gap-1">
              {label(t('provider.ticket.statusLabel'), 'ticket-set-status')}
              <select
                id="ticket-set-status"
                className={fieldClass}
                value={ticket.status}
                onChange={(e) => {
                  setStatus.mutate(e.target.value as Ticket['status']);
                }}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`provider.tickets.status.${s}` as MessageKey)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              {label(t('provider.ticket.assignLabel'), 'ticket-set-assignee')}
              <select
                id="ticket-set-assignee"
                className={fieldClass}
                value={ticket.assigneeId ?? ''}
                onChange={(e) => {
                  assign.mutate(e.target.value === '' ? null : e.target.value);
                }}
              >
                <option value="">{t('provider.ticket.unassigned')}</option>
                {(team.data ?? []).map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </section>
          <section className={panel}>
            <div className="mb-3 flex flex-col gap-1">
              {label(t('provider.ticket.savedReplies'), 'ticket-saved-reply')}
              <select
                id="ticket-saved-reply"
                className={fieldClass}
                value=""
                onChange={(e) => {
                  if (e.target.value) insert.mutate(e.target.value);
                }}
              >
                <option value="" />
                {(saved.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              {label(t('provider.ticket.replyLabel'), 'ticket-reply')}
              <textarea
                id="ticket-reply"
                rows={5}
                className={fieldClass}
                value={reply}
                onChange={(e) => {
                  setReply(e.target.value);
                }}
              />
            </div>
            <button
              type="button"
              className={`${btn} mt-3`}
              disabled={send.isPending || reply.trim() === ''}
              onClick={() => {
                send.mutate(reply);
              }}
            >
              {t('provider.ticket.send')}
            </button>
          </section>
          <section className={panel}>
            <label className="inline-flex min-h-[var(--target-min)] items-center gap-2 font-semibold">
              <input
                type="checkbox"
                checked={noteOpen}
                className="h-6 w-6"
                onChange={(e) => {
                  setNoteOpen(e.target.checked);
                }}
              />
              {t('provider.ticket.addNoteToggle')}
            </label>
            {noteOpen ? (
              <div className="mt-3 flex flex-col gap-1">
                {label(t('provider.ticket.noteLabel'), 'ticket-note')}
                <textarea
                  id="ticket-note"
                  rows={3}
                  className={fieldClass}
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value);
                  }}
                />
                <button
                  type="button"
                  className={`${btn} mt-2 self-start`}
                  disabled={addNote.isPending || note.trim() === ''}
                  onClick={() => {
                    addNote.mutate(note);
                  }}
                >
                  {t('provider.ticket.addNote')}
                </button>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </>
  );
}
