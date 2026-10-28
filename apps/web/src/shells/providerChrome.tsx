import { Icon } from '@sta/ui';
import { useT } from '../app/hooks';

/** Provider header status. The demo has no live monitoring, so this is a simulated, always-working indicator. */
export function ProviderStatus() {
  const t = useT();
  return (
    <span
      role="status"
      aria-label={t('provider.shell.status')}
      className="inline-flex min-h-[var(--target-min)] items-center gap-1 rounded-[var(--radius-sm)] border-2 border-[var(--color-border)] px-2 text-sm font-semibold"
    >
      <Icon name="check" />
      {`${t('provider.shell.statusOk')} (${t('provider.shell.statusNote')})`}
    </span>
  );
}
