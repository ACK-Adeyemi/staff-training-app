// S14 Help (staff) and C23 Help (client admins): FAQs, What's new, app feedback and tickets. One component for both.
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { releaseNotes, type MessageKey } from '@sta/content';
import { Button, Card, LinkButton, PageHeader } from '@sta/ui';
import { EnglishOnly } from '../../app/EnglishOnly';
import { useActor, useStore, useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { orEmpty } from '../client/queries';
import { FaqBrowser } from './FaqBrowser';
import { FeedbackSheet } from './FeedbackSheet';
import { TicketList } from './TicketList';
import { helpHref, useCanRaise, useCanViewOrgTickets, useHelpSide, useMyTickets, useOrgTickets } from './shared';

function WhatsNew() {
  const t = useT();
  const id = useId();
  const notes = [...releaseNotes].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="m-0 text-xl font-bold">
        {t('help.whatsNew')}
      </h2>
      <EnglishOnly className="flex flex-col gap-3">
        {notes.length === 0 ? <p className="m-0">{t('help.whatsNewEmpty')}</p> : null}
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {notes.map((n) => (
            <li key={n.id}>
              <Card>
                <p className="m-0 font-bold">{t(n.titleKey as MessageKey)}</p>
                <p className="my-1 text-sm">{formatLondonDate(`${n.date}T12:00:00.000Z`)}</p>
                <p className="m-0">{t(n.bodyKey as MessageKey)}</p>
              </Card>
            </li>
          ))}
        </ul>
      </EnglishOnly>
    </section>
  );
}

function OrgTickets() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const q = useOrgTickets(true);
  const names = useQuery({
    queryKey: ['userNames', actor.userId],
    queryFn: async () => new Map((await orEmpty(store.users.list(actor))).map((u) => [u.id, u.displayName])),
  });
  return (
    <TicketList
      title={t('tickets.organisation')}
      tickets={q.data}
      failed={q.isError}
      raisers={names.data ?? new Map()}
    />
  );
}

export function Help() {
  const t = useT();
  const side = useHelpSide();
  const canRaise = useCanRaise();
  const viewOrg = useCanViewOrgTickets();
  const mine = useMyTickets();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <>
      <PageHeader title={t('help.title')}>
        {canRaise ? <LinkButton href={helpHref(side, '/ticket/new')}>{t('help.raiseTicket')}</LinkButton> : null}
      </PageHeader>
      <div className="flex flex-col gap-8">
        <FaqBrowser audience={side} />
        <WhatsNew />
        <section className="flex flex-col gap-3">
          <p className="m-0">{t('help.stuck')}</p>
          <div>
            <Button
              variant="secondary"
              onClick={() => {
                setSent(false);
                setFeedbackOpen(true);
              }}
            >
              {t('help.sendFeedback')}
            </Button>
          </div>
          {sent ? (
            <p role="status" className="m-0 font-semibold">
              {t('feedback.app.thanks')}
            </p>
          ) : null}
        </section>
        <TicketList title={t('help.myTickets')} tickets={mine.data} failed={mine.isError} />
        {viewOrg ? <OrgTickets /> : null}
      </div>
      <FeedbackSheet
        open={feedbackOpen}
        onClose={() => {
          setFeedbackOpen(false);
        }}
        onSent={() => {
          setSent(true);
        }}
      />
    </>
  );
}
