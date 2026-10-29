import { holdsAnywhere } from '@sta/domain';
import { allPacks, type MessageKey } from '@sta/content';
import { PageHeader } from '@sta/ui';
import { useT } from '../../app/hooks';
import { usePermissions } from '../client/queries';

const KNOWN_TERMS = ['site', 'team', 'auditExport', 'inspector'];

/** Words for a terminology key: a language entry when known, otherwise the key split into words. */
function useTermLabel() {
  const t = useT();
  return (key: string): string => {
    if (KNOWN_TERMS.includes(key)) return t(`provider.packs.terms.${key}` as MessageKey);
    const spaced = key.replace(/([A-Z])/g, ' $1').toLowerCase();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  };
}

function PackCards() {
  const t = useT();
  const label = useTermLabel();
  return (
    <ul className="m-0 flex list-none flex-col gap-4 p-0">
      {allPacks.map((pack) => (
        <li
          key={pack.id}
          data-testid="pack-card"
          data-pack-id={pack.id}
          className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        >
          <h2 className="mt-0 mb-1 text-lg font-bold">{pack.name}</h2>
          <p className="my-1 font-semibold">
            {pack.status === 'full' ? t('provider.packs.statusFull') : t('provider.packs.statusStub')}
          </p>
          <p className="my-1">{t('provider.packs.roles', { count: pack.jobRoles.length })}</p>
          <p className="my-1">{t('provider.packs.requirements', { count: pack.requirements.length })}</p>
          <h3 className="mt-3 mb-1 text-base font-bold">{t('provider.packs.terminologyHeading')}</h3>
          <ul data-testid="pack-terminology" className="m-0 list-none p-0">
            {Object.entries(pack.terminology).map(([key, value]) => (
              <li key={key} data-term-key={key} className="min-h-[var(--target-min)] py-2">
                {`${label(key)}: ${value}`}
              </li>
            ))}
          </ul>
          {pack.prizeSuggestions.length > 0 ? (
            <>
              <h3 className="mt-3 mb-1 text-base font-bold">{t('provider.packs.prizesHeading')}</h3>
              <ul className="m-0 list-disc pl-6">
                {pack.prizeSuggestions.map((prize) => (
                  <li key={prize}>{prize}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mb-0">{t('provider.packs.stubNote')}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** P6: read-only list of the industry packs. */
export function Packs() {
  const t = useT();
  const perms = usePermissions();
  return (
    <>
      <PageHeader title={t('provider.packs.heading')} />
      <p className="mt-0">{t('provider.packs.intro')}</p>
      {!perms.data ? (
        <p>{t('shell.loading')}</p>
      ) : holdsAnywhere(perms.data, 'packs.read') ? (
        <PackCards />
      ) : (
        <p role="alert">{t('provider.packs.noPermission')}</p>
      )}
    </>
  );
}
