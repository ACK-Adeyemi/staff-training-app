import { useQuery } from '@tanstack/react-query';
import { Card, PageHeader } from '@sta/ui';
import type { MessageKey } from '@sta/content';
import { useDemo, useT } from '../../app/hooks';
import { Standalone } from '../../pages/pages';
import { formatLondonDateTime } from '../format';

const channels: Record<'email' | 'push' | 'sms', MessageKey> = {
  email: 'demo.outboxChannelEmail',
  push: 'demo.outboxChannelPush',
  sms: 'demo.outboxChannelSms',
};

/** D3. */
export function Outbox() {
  const t = useT();
  const demo = useDemo();
  const outbox = useQuery({ queryKey: ['outbox'], queryFn: () => demo.listOutbox() });
  const messages = outbox.data;
  return (
    <Standalone>
      <PageHeader title={t('demo.outboxTitle')} />
      {outbox.isError ? <p role="alert">{t('demo.outboxLoadError')}</p> : null}
      {messages?.length === 0 ? <p>{t('demo.outboxEmpty')}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {messages
          ?.slice()
          .sort((a, b) => b.at.localeCompare(a.at))
          .map((m) => (
            <li key={m.id}>
              <Card>
                <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
                  <dt className="font-semibold">{t('demo.outboxChannel')}</dt>
                  <dd className="m-0">{t(channels[m.channel])}</dd>
                  <dt className="font-semibold">{t('demo.outboxTo')}</dt>
                  <dd className="m-0 break-words">{m.to}</dd>
                  {m.subject ? (
                    <>
                      <dt className="font-semibold">{t('demo.outboxSubject')}</dt>
                      <dd className="m-0">{m.subject}</dd>
                    </>
                  ) : null}
                  <dt className="font-semibold">{t('demo.outboxBody')}</dt>
                  <dd className="m-0">{m.body}</dd>
                  <dt className="font-semibold">{t('demo.outboxSent')}</dt>
                  <dd className="m-0">{formatLondonDateTime(m.at)}</dd>
                  <dt className="font-semibold">{t('demo.outboxReason')}</dt>
                  <dd className="m-0">{m.reason}</dd>
                </dl>
              </Card>
            </li>
          ))}
      </ul>
    </Standalone>
  );
}
