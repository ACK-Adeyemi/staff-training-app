import { useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MessageKey } from '@sta/content';
import { Button, Card, PageHeader } from '@sta/ui';
import type { Notification } from '@sta/domain';
import { useActor, useStore, useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { useNotifications } from './queries';

/** S13, basic: the list and mark as read. Snooze, filters and push settings arrive later. */
export function Notifications() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const client = useQueryClient();
  const q = useNotifications();
  const markRead = useMutation({
    mutationFn: (id: string) => store.notifications.markRead(actor, [id]),
    onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const [notice, setNotice] = useState<{ role: 'status' | 'alert'; text: string } | null>(null);
  const snooze = useMutation({
    mutationFn: (id: string) => store.notifications.snooze(actor, id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['notifications'] });
      setNotice({ role: 'status', text: t('staff.notifications.snoozed') });
    },
    onError: () => {
      setNotice({ role: 'alert', text: t('staff.notifications.snoozeError') });
    },
  });

  const text = (n: Notification): string => {
    if (n.kind === 'trainingAssigned') {
      const due = String(n.params['dueDate'] ?? '');
      return t('staff.notifications.trainingAssigned', {
        moduleTitle: String(n.params['moduleTitle'] ?? ''),
        dueDate: due ? formatLondonDate(`${due}T12:00:00.000Z`) : '',
      });
    }
    if (n.kind === 'feedbackReply') {
      return t('staff.notifications.feedbackReply', { moduleTitle: String(n.params['moduleTitle'] ?? '') });
    }
    if (n.kind === 'reminder') {
      const kind = String(n.params['reminderKind'] ?? 'dueSoon');
      const date = String(n.params['date'] ?? '');
      return t(
        `staff.notifications.reminder.${kind === 'overdue' || kind === 'expiring' ? kind : 'dueSoon'}` as MessageKey,
        {
          training: String(n.params['training'] ?? ''),
          date: date ? formatLondonDate(`${date}T12:00:00.000Z`) : '',
        },
      );
    }
    return t('staff.notifications.other');
  };

  if (q.isError) return <p role="alert">{t('staff.notifications.loadError')}</p>;
  const list = (q.data ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <PageHeader title={t('staff.notifications.title')} />
      {notice ? <p role={notice.role}>{notice.text}</p> : null}
      {q.data && list.length === 0 ? <p>{t('staff.notifications.empty')}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {list.map((n) => (
          <li key={n.id}>
            <Card>
              <p className={`mt-0 mb-2 ${n.readAt ? '' : 'font-semibold'}`}>{text(n)}</p>
              <div className="flex flex-wrap items-center gap-2">
                {n.readAt ? (
                  <span>{t('staff.notifications.read')}</span>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      markRead.mutate(n.id);
                    }}
                  >
                    {t('staff.notifications.markRead')}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => {
                    snooze.mutate(n.id);
                  }}
                >
                  {t('staff.notifications.snooze')}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <QuietHours
        onSaved={(text) => {
          setNotice({ role: 'status', text });
        }}
      />
    </>
  );
}

const time = /^([01]\d|2[0-3]):[0-5]\d$/;
const inputClass =
  'min-h-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]';

/** The person's own quiet hours (F-7): no reminders between these times. Both empty means the organisation's times. */
function QuietHours({ onSaved }: { onSaved: (text: string) => void }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ['me', actor.userId], queryFn: () => store.me.get(actor) });
  if (!me.data) return null;
  return (
    <QuietHoursForm
      key={`${me.data.prefs.quietHours?.from ?? ''}-${me.data.prefs.quietHours?.to ?? ''}`}
      initial={me.data.prefs.quietHours}
      onSave={async (quietHours) => {
        await store.me.updatePrefs(actor, { quietHours });
        await queryClient.invalidateQueries({ queryKey: ['me'] });
        onSaved(t('staff.notifications.quietSaved'));
      }}
    />
  );
}

function QuietHoursForm({
  initial,
  onSave,
}: {
  initial: { from: string; to: string } | undefined;
  onSave: (quietHours: { from: string; to: string } | null) => Promise<void>;
}) {
  const t = useT();
  const [from, setFrom] = useState(initial?.from ?? '');
  const [to, setTo] = useState(initial?.to ?? '');
  const [error, setError] = useState(false);
  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    setError(false);
    const empty = from === '' && to === '';
    if (!empty && !(time.test(from) && time.test(to))) {
      setError(true);
      return;
    }
    try {
      await onSave(empty ? null : { from, to });
    } catch {
      setError(true);
    }
  };
  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="mt-6">
      <fieldset className="m-0 flex flex-col gap-3 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-4">
        <legend className="px-1 font-bold">{t('staff.notifications.quietHours')}</legend>
        <p className="m-0">{t('staff.notifications.quietHoursHelp')}</p>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 font-semibold">
            {t('staff.notifications.quietFrom')}
            <input
              type="time"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
              }}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 font-semibold">
            {t('staff.notifications.quietTo')}
            <input
              type="time"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
              }}
              className={inputClass}
            />
          </label>
        </div>
        {error ? <p role="alert">{t('staff.notifications.quietError')}</p> : null}
        <div>
          <Button type="submit">{t('staff.notifications.saveQuiet')}</Button>
        </div>
      </fieldset>
    </form>
  );
}
