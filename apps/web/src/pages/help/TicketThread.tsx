// S16 Ticket thread (staff) and its C23 twin: messages, status timeline, reply, resolve, reopen and rating.
import { useId, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NotFoundError } from '@sta/data';
import type { Ticket } from '@sta/domain';
import { Badge, Button, Card, PageHeader } from '@sta/ui';
import type { MessageKey } from '@sta/content';
import { useActor, useStore, useT } from '../../app/hooks';
import { formatLondonDateTime } from '../../demo/format';
import { inputClass } from '../client/foundationsErrors';
import { isOpen, statusKey } from './shared';

export function TicketThread() {
  const { ticketId = '' } = useParams();
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const client = useQueryClient();
  const replyId = useId();
  const ticket = useQuery({
    queryKey: ['ticket', ticketId, actor.userId],
    queryFn: () => store.tickets.get(actor, ticketId),
    retry: false,
  });
  const messages = useQuery({
    queryKey: ['ticketMessages', ticketId, actor.userId],
    queryFn: () => store.tickets.messages(actor, ticketId),
    enabled: ticket.isSuccess,
    retry: false,
  });
  const [reply, setReply] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['ticket'] }),
      client.invalidateQueries({ queryKey: ['ticketMessages'] }),
    ]);
  const run = async (action: () => Promise<unknown>, failure: MessageKey) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  if (ticket.isError) {
    return (
      <>
        <PageHeader title={t('tickets.title')} />
        <p role="alert">{t(ticket.error instanceof NotFoundError ? 'errors.notFound' : 'errors.generic')}</p>
      </>
    );
  }
  const row: Ticket | undefined = ticket.data;
  // No heading while loading: the page title is the ticket number, which is only known once it has loaded.
  if (!row || (!messages.data && !messages.isError)) return <p>{t('help.loading')}</p>;
  if (messages.isError) return <p role="alert">{t('errors.generic')}</p>;
  const mine = row.raisedBy === actor.userId;
  const list = messages.data;

  const send = async () => {
    if (reply.trim() === '') {
      setError('tickets.errors.reply');
      return;
    }
    await run(async () => {
      await store.tickets.reply(actor, row.id, { body: reply.trim() });
      setReply('');
    }, 'tickets.errors.replySend');
  };
  const rate = (value: 'up' | 'down') => run(() => store.tickets.rate(actor, row.id, value), 'tickets.errors.action');

  return (
    <>
      <PageHeader title={t('tickets.number', { number: row.number })} />
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="m-0 text-xl font-bold">{row.title}</h2>
          <Badge>{t(statusKey(row.status))}</Badge>
        </div>

        <ul aria-label={t('tickets.thread.messages')} className="m-0 flex list-none flex-col gap-3 p-0">
          {list.map((m) => (
            <li key={m.id}>
              <Card>
                <p className="m-0 text-sm font-semibold">
                  {m.side === 'provider' ? t('tickets.thread.support') : mine ? t('tickets.thread.you') : ''}{' '}
                  <span className="font-normal">{formatLondonDateTime(m.createdAt)}</span>
                </p>
                <p className="mt-1 mb-0 whitespace-pre-wrap">{m.body}</p>
                {m.attachmentIds.length > 0 ? (
                  <p className="mt-1 mb-0 text-sm">
                    {t('tickets.screenshots.attached', { count: m.attachmentIds.length })}
                  </p>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>

        <ul aria-label={t('tickets.thread.timeline')} className="m-0 flex list-none flex-col gap-1 p-0">
          <li>
            <span className="font-semibold">{t('tickets.thread.timelineReceived')}</span>{' '}
            {formatLondonDateTime(row.createdAt)}
          </li>
          {row.resolvedAt && !isOpen(row) ? (
            <li>
              <span className="font-semibold">{t('tickets.thread.timelineResolved')}</span>{' '}
              {formatLondonDateTime(row.resolvedAt)}
            </li>
          ) : null}
        </ul>

        {!mine ? <p className="m-0">{t('tickets.thread.readOnly')}</p> : null}

        {mine && row.status !== 'closed' ? (
          <div className="flex flex-col gap-2">
            <label htmlFor={replyId} className="font-semibold">
              {t('tickets.thread.reply')}
            </label>
            <textarea
              id={replyId}
              rows={3}
              value={reply}
              onChange={(e) => {
                setReply(e.target.value);
              }}
              className={inputClass}
            />
            <div>
              <Button
                disabled={busy}
                onClick={() => {
                  void send();
                }}
              >
                {t('tickets.thread.send')}
              </Button>
            </div>
          </div>
        ) : null}

        {mine && isOpen(row) ? (
          <div>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                void run(() => store.tickets.resolve(actor, row.id), 'tickets.errors.action');
              }}
            >
              {t('tickets.thread.markResolved')}
            </Button>
          </div>
        ) : null}
        {mine && row.status === 'resolved' ? (
          <div>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                void run(() => store.tickets.reopen(actor, row.id), 'tickets.errors.action');
              }}
            >
              {t('tickets.thread.reopen')}
            </Button>
          </div>
        ) : null}

        {row.status === 'resolved' && mine && row.satisfaction === undefined ? (
          <div role="group" aria-label={t('tickets.thread.rate')} className="flex flex-wrap items-center gap-3">
            <span aria-hidden="true" className="font-semibold">
              {t('tickets.thread.rate')}
            </span>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                void rate('up');
              }}
            >
              {t('tickets.thread.up')}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                void rate('down');
              }}
            >
              {t('tickets.thread.down')}
            </Button>
          </div>
        ) : null}
        {row.satisfaction !== undefined ? (
          <p className="m-0 font-semibold">
            {t(row.satisfaction === 'up' ? 'tickets.thread.ratedUp' : 'tickets.thread.ratedDown')}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="m-0">
            {t(error)}
          </p>
        ) : null}
      </div>
    </>
  );
}
