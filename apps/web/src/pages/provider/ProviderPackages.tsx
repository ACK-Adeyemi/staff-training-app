import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { holdsAnywhere } from '@sta/domain';
import { packages, type MessageKey } from '@sta/content';
import { PageHeader } from '@sta/ui';
import { useDemo, useT } from '../../app/hooks';
import { usePermissions } from '../client/queries';

type Option = 'A' | 'B';
const OPTIONS: { value: Option; key: MessageKey }[] = [
  { value: 'A', key: 'provider.packages.optionA' },
  { value: 'B', key: 'provider.packages.optionB' },
];

function useFormatValue() {
  const t = useT();
  return (value: unknown): string => {
    if (value === 'unlimited') return t('provider.packages.unlimited');
    if (typeof value === 'boolean') return t(value ? 'provider.packages.yes' : 'provider.packages.no');
    return String(value);
  };
}

function PackageCards({ option }: { option: Option }) {
  const t = useT();
  const format = useFormatValue();
  return (
    <ul className="m-0 flex list-none flex-col gap-4 p-0">
      {packages
        .filter((p) => p.option === option)
        .map((pkg) => (
          <li
            key={pkg.id}
            data-testid="package-card"
            data-package-id={pkg.id}
            className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <h3 className="mt-0 mb-2 text-lg font-bold">{pkg.name}</h3>
            <ul className="m-0 list-none p-0">
              {Object.entries(pkg.entitlements).map(([key, value]) => (
                <li key={key} className="min-h-[var(--target-min)] py-2">
                  {t('provider.packages.limit', {
                    label: t(`provider.packages.limitLabels.${key}` as MessageKey),
                    value: format(value),
                  })}
                </li>
              ))}
            </ul>
          </li>
        ))}
    </ul>
  );
}

function Content({ canChange }: { canChange: boolean }) {
  const t = useT();
  const demo = useDemo();
  const queryClient = useQueryClient();
  const option = useQuery({ queryKey: ['packagingOption'], queryFn: () => demo.getPackagingOption() });
  const change = useMutation({
    mutationFn: (next: Option) => demo.setPackagingOption(next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['packagingOption'] }),
  });
  if (option.isError) return <p role="alert">{t('provider.packages.loadError')}</p>;
  if (!option.data) return <p>{t('shell.loading')}</p>;
  const current = change.isPending ? change.variables : option.data;
  return (
    <>
      <section aria-labelledby="packaging-option-heading" className="mb-6">
        <h2 id="packaging-option-heading" className="mt-0 text-lg font-bold">
          {t('provider.packages.optionRegion')}
        </h2>
        <div role="radiogroup" aria-label={t('provider.packages.optionLegend')} className="flex flex-col gap-2">
          {OPTIONS.map((o) => (
            <label
              key={o.value}
              className="flex min-h-[var(--target-min)] items-center gap-3 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] px-3 py-2"
            >
              <input
                type="radio"
                name="packaging-option"
                className="size-6 shrink-0"
                checked={current === o.value}
                disabled={!canChange || change.isPending}
                onChange={() => {
                  change.mutate(o.value);
                }}
              />
              <span>{t(o.key)}</span>
            </label>
          ))}
        </div>
        <p>{t('provider.packages.demoNote')}</p>
        {!canChange ? <p>{t('provider.packages.readOnlyNote')}</p> : null}
      </section>
      <PackageCards option={option.data} />
      <section
        data-testid="records-keeper-card"
        className="mt-4 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4"
      >
        <h2 className="mt-0 mb-1 text-lg font-bold">{t('provider.packages.recordsKeeperHeading')}</h2>
        <p className="m-0">{t('provider.packages.recordsKeeperBody')}</p>
      </section>
    </>
  );
}

/** P7: the demo-wide packaging option and what each package includes. */
export function ProviderPackages() {
  const t = useT();
  const perms = usePermissions();
  return (
    <>
      <PageHeader title={t('provider.packages.heading')} />
      {!perms.data ? (
        <p>{t('shell.loading')}</p>
      ) : holdsAnywhere(perms.data, 'billing.read') ? (
        <Content canChange={holdsAnywhere(perms.data, 'billing.write')} />
      ) : (
        <p role="alert">{t('provider.packages.noPermission')}</p>
      )}
    </>
  );
}
