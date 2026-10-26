import { Icon, type IconName } from './Icon';

export interface BadgeTileProps {
  name: string;
  icon: IconName;
  earned: boolean;
  /** Earned date, or the next goal when not earned. */
  detail: string;
  /** Visible state word, for example "Earned" or "Locked". */
  stateLabel: string;
}

export function BadgeTile({ name, icon, earned, detail, stateLabel }: BadgeTileProps) {
  return (
    <div
      data-earned={earned ? 'true' : 'false'}
      className={`flex flex-col items-center gap-1 rounded-[var(--radius-md)] border-2 p-3 text-center ${earned ? 'border-solid border-[var(--color-accent)] bg-[var(--color-surface)]' : 'border-dashed border-[var(--color-border)] bg-transparent'}`}
    >
      <Icon
        name={icon}
        size={32}
        className={earned ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}
      />
      <span className="font-bold">{name}</span>
      <span className="text-sm">{detail}</span>
      <span className="text-sm font-semibold underline underline-offset-2">{stateLabel}</span>
    </div>
  );
}
