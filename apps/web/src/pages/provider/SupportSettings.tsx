import { useState, type SyntheticEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { issueTypes, supportFeatures, type MessageKey } from '@sta/content';
import { holdsAnywhere } from '@sta/domain';
import type { OtherEntryGroupRow } from '@sta/data';
import { Button, Dialog, PageHeader } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';
import { fieldClass } from '../client/feedbackShared';
import { usePermissions } from '../client/queries';

type Field = 'feature' | 'issueType';

const btn =
  'min-h-[var(--target-min)] min-w-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] px-4 py-2 font-bold';
const box = 'mb-6 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4';

/** P13: catalogue lists, Other entries review with Create issue type, and saved replies. */
export function SupportSettings() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const perms = usePermissions();
  const canRead = perms.data ? holdsAnywhere(perms.data, 'tickets.read') : false;
  const canWrite = perms.data ? holdsAnywhere(perms.data, 'tickets.write') : false;
  const [field, setField] = useState<Field>('feature');
  const [target, setTarget] = useState<OtherEntryGroupRow | null>(null);
  const [name, setName] = useState('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [retagged, setRetagged] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [replyTitle, setReplyTitle] = useState('');
  const [replyBody, setReplyBody] = useState('');

  const groups = useQuery({
    queryKey: ['otherEntries', actor.userId, field],
    queryFn: () => store.otherEntries.review(actor, field),
    enabled: canRead,
    placeholderData: keepPreviousData,
  });
  const replies = useQuery({
    queryKey: ['savedReplies', actor.userId],
    queryFn: () => store.savedReplies.list(actor),
    enabled: canRead,
  });

  const create = useMutation({
    mutationFn: (input: { groupId: string; name: string; ticketIds: string[] }) =>
      store.otherEntries.createIssueType(actor, input),
    onSuccess: async (res) => {
      setTarget(null);
      setError(false);
      setRetagged(res.retagged);
      await queryClient.invalidateQueries({ queryKey: ['otherEntries'] });
    },
    onError: () => {
      setError(true);
    },
  });
  const addReply = useMutation({
    mutationFn: () => store.savedReplies.create(actor, { title: replyTitle.trim(), body: replyBody.trim() }),
    onSuccess: async () => {
      setReplyTitle('');
      setReplyBody('');
      setError(false);
      await queryClient.invalidateQueries({ queryKey: ['savedReplies'] });
    },
    onError: () => {
      setError(true);
    },
  });

  const open = (g: OtherEntryGroupRow) => {
    setName(g.normalised);
    setTicked([...g.ticketIds]);
    setError(false);
    setTarget(g);
  };
  const onCreate = (e: SyntheticEvent) => {
    e.preventDefault();
    if (!target) return;
    create.mutate({ groupId: target.id, name: name.trim(), ticketIds: ticked });
  };
  const onAddReply = (e: SyntheticEvent) => {
    e.preventDefault();
    if (!replyTitle.trim() || !replyBody.trim()) {
      setError(true);
      return;
    }
    addReply.mutate();
  };

  const catalogue = (label: string, items: { id: string; labelKey: string }[]) => (
    <section aria-label={label} className={box}>
      <h2 className="mt-0 text-lg font-bold">{label}</h2>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {items.map((i) => (
          <li key={i.id} className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] px-3 py-1">
            {t(i.labelKey as MessageKey)}
          </li>
        ))}
      </ul>
    </section>
  );

  // The whole page waits for its first data, so the heading never shows over an empty page.
  const loading = !perms.data || (canRead && (!groups.data || !replies.data));
  if (loading) return <p>{t('shell.loading')}</p>;

  return (
    <>
      <PageHeader title={t('provider.supportSettings.heading')} />
      {!canRead ? (
        <p role="alert">{t('provider.supportSettings.noPermission')}</p>
      ) : (
        <>
          {catalogue(t('provider.supportSettings.features'), supportFeatures)}
          {catalogue(t('provider.supportSettings.issueTypes'), issueTypes)}

          <section aria-label={t('provider.supportSettings.otherEntries')} className={box}>
            <h2 className="mt-0 text-lg font-bold">{t('provider.supportSettings.otherEntries')}</h2>
            <div
              role="radiogroup"
              aria-label={t('provider.supportSettings.fieldLabel')}
              className="mb-3 flex flex-wrap gap-4"
            >
              {(['feature', 'issueType'] as Field[]).map((f) => (
                <label key={f} className="inline-flex min-h-[var(--target-min)] items-center gap-2 font-semibold">
                  <input
                    type="radio"
                    name="other-entry-field"
                    className="h-5 w-5"
                    checked={field === f}
                    onChange={() => {
                      setField(f);
                      setRetagged(null);
                    }}
                  />
                  {f === 'feature'
                    ? t('provider.supportSettings.fieldFeature')
                    : t('provider.supportSettings.fieldIssueType')}
                </label>
              ))}
            </div>
            {retagged !== null ? (
              <p data-testid="retag-confirmation" role="status" className="font-bold">
                {retagged === 1
                  ? t('provider.supportSettings.retaggedOne')
                  : t('provider.supportSettings.retagged', { count: retagged })}
              </p>
            ) : null}
            {groups.data && groups.data.length === 0 ? <p>{t('provider.supportSettings.empty')}</p> : null}
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {(groups.data ?? []).map((g) => (
                <li
                  key={g.id}
                  data-testid="other-entry-group"
                  data-group-id={g.id}
                  className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3"
                >
                  <p className="m-0 font-bold">{g.normalised}</p>
                  <p className="m-0">
                    {g.clientCount === 1
                      ? t('provider.supportSettings.usedByOne')
                      : t('provider.supportSettings.usedBy', { count: g.clientCount })}
                    {'. '}
                    {g.count === 1
                      ? t('provider.supportSettings.ticketsOne')
                      : t('provider.supportSettings.tickets', { count: g.count })}
                  </p>
                  {g.trending ? <p className="m-0 font-bold">{t('provider.supportSettings.trending')}</p> : null}
                  {canWrite && g.field === 'issueType' ? (
                    <button
                      type="button"
                      className={`${btn} mt-2`}
                      onClick={() => {
                        open(g);
                      }}
                    >
                      {t('provider.supportSettings.createIssueType')}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <section aria-label={t('provider.supportSettings.savedReplies')} className={box}>
            <h2 className="mt-0 text-lg font-bold">{t('provider.supportSettings.savedReplies')}</h2>
            <ul className="m-0 mb-4 flex list-none flex-col gap-3 p-0">
              {(replies.data ?? []).map((r) => (
                <li
                  key={r.id}
                  data-testid="saved-reply"
                  data-reply-id={r.id}
                  className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3"
                >
                  <p className="m-0 font-bold">{r.title}</p>
                  <p className="m-0">{r.body}</p>
                </li>
              ))}
            </ul>
            {canWrite ? (
              <form onSubmit={onAddReply} noValidate className="flex flex-col gap-3">
                <label htmlFor="reply-title" className="font-semibold">
                  {t('provider.supportSettings.replyTitle')}
                </label>
                <input
                  id="reply-title"
                  value={replyTitle}
                  onChange={(e) => {
                    setReplyTitle(e.target.value);
                  }}
                  className={fieldClass}
                />
                <label htmlFor="reply-body" className="font-semibold">
                  {t('provider.supportSettings.replyBody')}
                </label>
                <textarea
                  id="reply-body"
                  rows={3}
                  value={replyBody}
                  onChange={(e) => {
                    setReplyBody(e.target.value);
                  }}
                  className={fieldClass}
                />
                {error && !target ? <p role="alert">{t('provider.supportSettings.failed')}</p> : null}
                <div>
                  <Button type="submit" disabled={addReply.isPending}>
                    {t('provider.supportSettings.addReply')}
                  </Button>
                </div>
              </form>
            ) : null}
          </section>

          <Dialog
            open={target !== null}
            title={t('provider.supportSettings.createIssueType')}
            onClose={() => {
              setTarget(null);
            }}
          >
            {target ? (
              <form onSubmit={onCreate} noValidate className="flex flex-col gap-3">
                <label htmlFor="issue-type-name" className="font-semibold">
                  {t('provider.supportSettings.name')}
                </label>
                <input
                  id="issue-type-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                  }}
                  className={fieldClass}
                />
                <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
                  <legend className="font-semibold">{t('provider.supportSettings.ticketsToRetag')}</legend>
                  {target.ticketIds.map((id) => (
                    <label key={id} className="inline-flex min-h-[var(--target-min)] items-center gap-2">
                      <input
                        type="checkbox"
                        data-testid="retag-ticket"
                        data-ticket-id={id}
                        className="h-5 w-5"
                        checked={ticked.includes(id)}
                        onChange={(e) => {
                          setTicked(e.target.checked ? [...ticked, id] : ticked.filter((x) => x !== id));
                        }}
                      />
                      {id}
                    </label>
                  ))}
                </fieldset>
                {error ? <p role="alert">{t('provider.supportSettings.failed')}</p> : null}
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={create.isPending}>
                    {t('provider.supportSettings.create')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setTarget(null);
                    }}
                  >
                    {t('provider.supportSettings.cancel')}
                  </Button>
                </div>
              </form>
            ) : null}
          </Dialog>
        </>
      )}
    </>
  );
}
