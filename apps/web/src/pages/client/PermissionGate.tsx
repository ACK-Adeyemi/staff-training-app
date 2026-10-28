import type { ReactNode } from 'react';
import { can, holdsAnywhere } from '@sta/domain';
import type { MessageKey } from '@sta/content';
import { useActor, useT } from '../../app/hooks';
import { usePermissions } from './queries';

/** Shows its children only to someone who holds the permission for their own client. Fails closed. */
export function PermissionGate({
  permission,
  message,
  anyScope = false,
  children,
}: {
  permission: string;
  message: MessageKey;
  /** For organisation-wide permissions such as billing: holding it at all is enough, as in the data layer. */
  anyScope?: boolean;
  children: ReactNode;
}) {
  const t = useT();
  const actor = useActor();
  const perms = usePermissions();
  if (!perms.data) return <p>{t('shell.loading')}</p>;
  const allowed =
    actor.clientId !== undefined &&
    (anyScope ? holdsAnywhere(perms.data, permission) : can(perms.data, permission, { clientId: actor.clientId }));
  if (!allowed) return <p role="alert">{t(message)}</p>;
  return <>{children}</>;
}
