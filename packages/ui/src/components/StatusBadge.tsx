import { Icon, type IconName } from './Icon';

export type RequirementStatus = 'current' | 'expiringSoon' | 'awaitingCheck' | 'overdue' | 'notStarted' | 'notAssigned';

const config: Record<RequirementStatus, { icon: IconName; colour: string }> = {
  current: { icon: 'check', colour: 'text-[var(--status-current)] border-[var(--status-current)]' },
  expiringSoon: { icon: 'clock', colour: 'text-[var(--status-expiring)] border-[var(--status-expiring)]' },
  awaitingCheck: { icon: 'help', colour: 'text-[var(--status-awaiting)] border-[var(--status-awaiting)]' },
  overdue: { icon: 'alert', colour: 'text-[var(--status-overdue)] border-[var(--status-overdue)]' },
  notStarted: { icon: 'x-circle', colour: 'text-[var(--status-overdue)] border-[var(--status-overdue)]' },
  notAssigned: {
    icon: 'minus-circle',
    colour: 'text-[var(--status-not-assigned)] border-[var(--status-not-assigned)]',
  },
};

export interface StatusBadgeProps {
  status: RequirementStatus;
  label: string;
}

/** Status is always an icon plus a word; colour is only a reinforcement. */
export function StatusBadge({ status, label }: StatusBadgeProps) {
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[var(--radius-sm)] border-2 bg-[var(--color-surface)] px-2 py-1 text-sm font-semibold ${c.colour}`}
    >
      <Icon name={c.icon} size={16} />
      <span>{label}</span>
    </span>
  );
}
