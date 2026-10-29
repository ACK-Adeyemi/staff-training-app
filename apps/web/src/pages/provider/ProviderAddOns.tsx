import { useNavigate } from 'react-router';
import { holdsAnywhere } from '@sta/domain';
import { addOnCopy, addOnIds, addOns, type MessageKey } from '@sta/content';
import { PageHeader } from '@sta/ui';
import { useT } from '../../app/hooks';
import { formatPounds } from '../../demo/format';
import { usePermissions } from '../client/queries';

/** P8: the add-on catalogue. Prices are changed only on P25 (confirmed with a step-up code), never here. */
export function ProviderAddOns() {
  const t = useT();
  const navigate = useNavigate();
  const perms = usePermissions();
  const canEdit = perms.data ? holdsAnywhere(perms.data, 'billing.write') : false;
  return (
    <>
      <PageHeader title={t('provider.addOns.heading')} />
      {!perms.data ? (
        <p>{t('shell.loading')}</p>
      ) : !holdsAnywhere(perms.data, 'billing.read') ? (
        <p role="alert">{t('provider.addOns.noPermission')}</p>
      ) : (
        <>
          <p>
            {t('provider.addOns.appliesTo', {
              options: `${t('provider.addOns.optionA')}, ${t('provider.addOns.optionB')}`,
            })}
          </p>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {addOns.map((a) => {
              const copy = addOnCopy[a.id];
              return (
                <li
                  key={a.id}
                  data-testid="addon-card"
                  data-addon-id={a.id}
                  className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                >
                  <h2 className="mt-0 mb-1 text-lg font-bold">{a.name}</h2>
                  {a.id === addOnIds.aiAssistant ? (
                    <p className="m-0 font-bold">{t('provider.addOns.demoAi')}</p>
                  ) : null}
                  {copy ? <p>{t(copy.whatKey as MessageKey)}</p> : null}
                  <p className="font-bold">
                    {a.pricing.kind === 'flat'
                      ? t('provider.addOns.priceFlat', { price: formatPounds(a.pricing.price) })
                      : t('provider.addOns.priceUsage', {
                          price: formatPounds(a.pricing.pricePerUnit),
                          unit: a.pricing.unit,
                          included: a.pricing.includedUnits,
                        })}
                  </p>
                  <p className="flex flex-wrap gap-2">
                    {(['optionA', 'optionB'] as const).map((k) => (
                      <span
                        key={k}
                        className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] px-2 py-1"
                      >
                        {t(`provider.addOns.${k}`)}
                      </span>
                    ))}
                  </p>
                  {canEdit ? (
                    <button
                      type="button"
                      className="min-h-[var(--target-min)] min-w-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] px-4 py-2 font-bold"
                      title={t('provider.addOns.editPriceHint')}
                      onClick={() => {
                        void navigate('/provider/pricing');
                      }}
                    >
                      {t('provider.addOns.editPrice')}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
