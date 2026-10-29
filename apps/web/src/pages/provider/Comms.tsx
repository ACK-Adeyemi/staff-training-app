import { useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { allPacks, packages, type MessageKey } from '@sta/content';
import { holdsAnywhere, type Announcement } from '@sta/domain';
import { Button, PageHeader } from '@sta/ui';
import { useActor, useClock, useStore, useT } from '../../app/hooks';
import { fieldClass } from '../client/feedbackShared';
import { usePermissions } from '../client/queries';

type Audience = 'all' | 'package' | 'pack' | 'clients';
type Channel = Announcement['channels'][number];
const CHANNELS: Channel[] = ['banner', 'notification', 'email'];
const AUDIENCES: Audience[] = ['all', 'package', 'pack', 'clients'];

const box = 'mb-6 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4';
const choice = 'inline-flex min-h-[var(--target-min)] items-center gap-2 font-semibold';

const audienceOf = (a: Announcement['audience']): Audience =>
  a.clientIds ? 'clients' : a.packageIds ? 'package' : a.packIds ? 'pack' : 'all';

/** P14: announcements to clients (list and composer) and the release notes. */
export function Comms() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  const queryClient = useQueryClient();
  const perms = usePermissions();
  const canSend = perms.data ? holdsAnywhere(perms.data, 'comms.send') : false;
  const canSendAll = perms.data ? holdsAnywhere(perms.data, 'comms.sendAll') : false;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [picked, setPicked] = useState<Audience | null>(null);
  const [packageId, setPackageId] = useState(packages[0]?.id ?? '');
  const [packId, setPackId] = useState(allPacks[0]?.id ?? '');
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [publishAt, setPublishAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState(false);
  const audience: Audience = picked ?? (canSendAll ? 'all' : 'package');

  const announcements = useQuery({
    queryKey: ['announcements', actor.userId],
    queryFn: () => store.providerComms.listAnnouncements(actor),
    enabled: canSend,
  });
  const notes = useQuery({
    queryKey: ['releaseNotes', actor.userId],
    queryFn: () => store.releaseNotes.list(actor),
  });
  const clients = useQuery({
    queryKey: ['providerClients', actor.userId],
    queryFn: () => store.providerOverview.clients(actor),
    enabled: canSend && audience === 'clients',
  });

  const send = useMutation({
    mutationFn: () => {
      const target: Announcement['audience'] = {
        sides: ['staff', 'client'],
        ...(audience === 'package' ? { packageIds: [packageId] } : {}),
        ...(audience === 'pack' ? { packIds: [packId] } : {}),
        ...(audience === 'clients' ? { clientIds } : {}),
      };
      return store.providerComms.createAnnouncement(actor, {
        title: title.trim(),
        body: body.trim(),
        audience: target,
        channels,
        publishAt: publishAt ? new Date(publishAt).toISOString() : clock.now().toISOString(),
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      });
    },
    onSuccess: async () => {
      setTitle('');
      setBody('');
      setClientIds([]);
      setChannels([]);
      setPublishAt('');
      setExpiresAt('');
      setError(false);
      await queryClient.invalidateQueries({ queryKey: ['announcements'] });
    },
    onError: () => {
      setError(true);
    },
  });

  const onSend = (e: SyntheticEvent) => {
    e.preventDefault();
    if (!title.trim() || channels.length === 0 || (audience === 'clients' && clientIds.length === 0)) {
      setError(true);
      return;
    }
    send.mutate();
  };
  const toggle = <T,>(list: T[], item: T, on: boolean): T[] => (on ? [...list, item] : list.filter((x) => x !== item));

  const loading = !perms.data || (canSend && !announcements.data) || !notes.data;
  if (loading) return <p>{t('shell.loading')}</p>;

  const word = (a: Audience) => t(`provider.comms.audience.${a}` as MessageKey);
  const channelWord = (c: Channel) => t(`provider.comms.channel.${c}` as MessageKey);

  return (
    <>
      <PageHeader title={t('provider.comms.heading')} />
      {!canSend ? (
        <p role="alert">{t('provider.comms.noAccess')}</p>
      ) : (
        <>
          <section aria-label={t('provider.comms.announcements')} className={box}>
            <h2 className="mt-0 text-lg font-bold">{t('provider.comms.announcements')}</h2>
            {(announcements.data ?? []).length === 0 ? <p>{t('provider.comms.none')}</p> : null}
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {(announcements.data ?? []).map((a) => (
                <li
                  key={a.id}
                  data-testid="announcement"
                  data-announcement-id={a.id}
                  className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3"
                >
                  <p className="m-0 font-bold">{a.title}</p>
                  <p className="m-0">{a.body}</p>
                  <p className="m-0">{t('provider.comms.audienceLabel', { audience: word(audienceOf(a.audience)) })}</p>
                  <p className="m-0">
                    {t('provider.comms.channelsLabel', { channels: a.channels.map(channelWord).join(', ') })}
                  </p>
                  {a.reads > 0 ? <p className="m-0">{t('provider.comms.reads', { count: a.reads })}</p> : null}
                </li>
              ))}
            </ul>
          </section>

          <form onSubmit={onSend} noValidate className={`${box} flex flex-col gap-3`}>
            <label htmlFor="comms-title" className="font-semibold">
              {t('provider.comms.titleField')}
            </label>
            <input
              id="comms-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
              className={fieldClass}
            />
            <label htmlFor="comms-body" className="font-semibold">
              {t('provider.comms.messageField')}
            </label>
            <textarea
              id="comms-body"
              rows={3}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
              }}
              className={fieldClass}
            />

            <div role="radiogroup" aria-label={t('provider.comms.audienceGroup')} className="flex flex-wrap gap-4">
              {AUDIENCES.filter((a) => a !== 'all' || canSendAll).map((a) => (
                <label key={a} className={choice}>
                  <input
                    type="radio"
                    name="comms-audience"
                    className="h-5 w-5"
                    checked={audience === a}
                    onChange={() => {
                      setPicked(a);
                    }}
                  />
                  {word(a)}
                </label>
              ))}
            </div>
            {audience === 'package' ? (
              <select
                aria-label={t('provider.comms.packageField')}
                value={packageId}
                onChange={(e) => {
                  setPackageId(e.target.value);
                }}
                className={fieldClass}
              >
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : null}
            {audience === 'pack' ? (
              <select
                aria-label={t('provider.comms.packField')}
                value={packId}
                onChange={(e) => {
                  setPackId(e.target.value);
                }}
                className={fieldClass}
              >
                {allPacks.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : null}
            {audience === 'clients' ? (
              <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
                <legend className="font-semibold">{t('provider.comms.clientsField')}</legend>
                {(clients.data ?? []).map((c) => (
                  <label key={c.clientId} className={choice}>
                    <input
                      type="checkbox"
                      data-testid="audience-client"
                      data-client-id={c.clientId}
                      className="h-5 w-5"
                      checked={clientIds.includes(c.clientId)}
                      onChange={(e) => {
                        setClientIds(toggle(clientIds, c.clientId, e.target.checked));
                      }}
                    />
                    {c.displayName}
                  </label>
                ))}
              </fieldset>
            ) : null}

            <fieldset className="m-0 flex flex-wrap gap-4 border-0 p-0">
              <legend className="font-semibold">{t('provider.comms.channelGroup')}</legend>
              {CHANNELS.map((c) => (
                <label key={c} className={choice}>
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={channels.includes(c)}
                    onChange={(e) => {
                      setChannels(toggle(channels, c, e.target.checked));
                    }}
                  />
                  {channelWord(c)}
                </label>
              ))}
            </fieldset>

            <label htmlFor="comms-publish" className="font-semibold">
              {t('provider.comms.publishAt')}
            </label>
            <input
              id="comms-publish"
              type="datetime-local"
              value={publishAt}
              onChange={(e) => {
                setPublishAt(e.target.value);
              }}
              className={fieldClass}
            />
            <label htmlFor="comms-expires" className="font-semibold">
              {t('provider.comms.expiresAt')}
            </label>
            <input
              id="comms-expires"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => {
                setExpiresAt(e.target.value);
              }}
              className={fieldClass}
            />
            <p data-testid="comms-help" className="m-0">
              {t('provider.comms.help')}
            </p>

            <section
              aria-label={t('provider.comms.preview')}
              data-testid="announcement-preview"
              className="rounded-[var(--radius-md)] border-2 border-dashed border-[var(--color-border)] p-3"
            >
              <h2 className="mt-0 text-lg font-bold">{t('provider.comms.preview')}</h2>
              <p className="m-0 font-bold">{title}</p>
              <p className="m-0">{body}</p>
            </section>

            {error ? <p role="alert">{t('provider.comms.failed')}</p> : null}
            <div>
              <Button type="submit" disabled={send.isPending}>
                {t('provider.comms.send')}
              </Button>
            </div>
          </form>
        </>
      )}

      <section aria-label={t('provider.comms.releaseNotes')} className={box}>
        <h2 className="mt-0 text-lg font-bold">{t('provider.comms.releaseNotes')}</h2>
        {notes.data.length === 0 ? <p>{t('provider.comms.noNotes')}</p> : null}
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {notes.data.map((n) => (
            <li
              key={n.id}
              data-testid="release-note"
              className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3"
            >
              <p className="m-0 font-bold">{n.title}</p>
              <p className="m-0">{t('provider.comms.noteDate', { date: n.date.slice(0, 10) })}</p>
              <p className="m-0">{n.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
