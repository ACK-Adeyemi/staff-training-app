import { displayDomain, type LearnMoreLink as Link } from '@sta/domain';
import { LearnMoreLink } from '@sta/ui';
import { useT } from '../../app/hooks';

/** One group of Learn more links: official sources first, then the organisation's own. Opening a link is recorded. */
export function LearnMoreGroups({
  official,
  organisation,
  organisationName,
  onOpen,
}: {
  official: Link[];
  organisation: Link[];
  organisationName: string;
  onOpen: (link: Link) => void;
}) {
  const t = useT();
  const render = (l: Link) => {
    const kindLabel = t(`staff.quiz.kind.${l.kind}`);
    const common = {
      label: t('staff.quiz.learnMoreLabel', { title: l.title }),
      newTabLabel: t('staff.quiz.newTab'),
      kindLabel,
      ...(l.locator ? { locator: l.locator } : {}),
      onOpen: () => {
        onOpen(l);
      },
    };
    return (
      <li key={l.id}>
        {l.url ? (
          <LearnMoreLink {...common} url={l.url} domain={displayDomain(l.url)} />
        ) : (
          <LearnMoreLink {...common} url={`#/doc/${l.attachmentId ?? ''}`} internal domain={organisationName} />
        )}
      </li>
    );
  };
  if (official.length === 0 && organisation.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-3">
      {official.length > 0 ? (
        <div>
          <p className="m-0 font-semibold">{t('staff.quiz.learnMore')}</p>
          <ul className="m-0 list-none p-0">{official.map(render)}</ul>
        </div>
      ) : null}
      {organisation.length > 0 ? (
        <div>
          <p className="m-0 font-semibold">{t('staff.quiz.fromOrganisation')}</p>
          <ul className="m-0 list-none p-0">{organisation.map(render)}</ul>
        </div>
      ) : null}
    </div>
  );
}
