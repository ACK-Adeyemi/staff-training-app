import { useMutation, useQueryClient } from '@tanstack/react-query';
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

  const text = (n: Notification): string => {
    if (n.kind === 'trainingAssigned') {
      const due = String(n.params['dueDate'] ?? '');
      return t('staff.notifications.trainingAssigned', {
        moduleTitle: String(n.params['moduleTitle'] ?? ''),
        dueDate: due ? formatLondonDate(`${due}T12:00:00.000Z`) : '',
      });
    }
    return t('staff.notifications.other');
  };

  if (q.isError) return <p role="alert">{t('staff.notifications.loadError')}</p>;
  const list = (q.data ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <PageHeader title={t('staff.notifications.title')} />
      {q.data && list.length === 0 ? <p>{t('staff.notifications.empty')}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {list.map((n) => (
          <li key={n.id}>
            <Card>
              <p className={`mt-0 mb-2 ${n.readAt ? '' : 'font-semibold'}`}>{text(n)}</p>
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
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
