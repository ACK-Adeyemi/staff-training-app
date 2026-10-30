import type { ReactNode } from 'react';
import { holdsAnywhere } from '@sta/domain';
import { useT } from '../../app/hooks';
import { usePermissions } from '../client/queries';

/** Shows the children only to someone who can read clients (can(), never a role name). */
export function ClientsReadGate({ children }: { children: ReactNode }) {
  const t = useT();
  const perms = usePermissions();
  if (!perms.data) return <p>{t('shell.loading')}</p>;
  if (!holdsAnywhere(perms.data, 'clients.read')) return <p role="alert">{t('provider.noPermission')}</p>;
  return <>{children}</>;
}
