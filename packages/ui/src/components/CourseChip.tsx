import { focusClasses } from './Button';
import { Icon, type IconName } from './Icon';

export interface CourseChipProps {
  name: string;
  icon: IconName;
  /** Category colour token key, for example "cat-2". */
  colour: string;
  /** Leave out when the course no longer exists. */
  href?: string;
  unavailableLabel: string;
}

export function CourseChip({ name, icon, colour, href, unavailableLabel }: CourseChipProps) {
  const style = { borderColor: `var(--${colour}, var(--color-border))` };
  const base =
    'inline-flex min-h-[var(--target-min)] items-center gap-2 rounded-full border-2 bg-[var(--color-surface)] px-3 py-1 font-semibold';
  if (href) {
    return (
      <a href={href} data-colour={colour} style={style} className={`${base} underline ${focusClasses}`}>
        <Icon name={icon} size={18} />
        <span>{name}</span>
      </a>
    );
  }
  return (
    <span data-colour={colour} style={style} className={`${base} border-dashed`}>
      <Icon name={icon} size={18} />
      <span>{name}</span>
      <span className="text-sm font-normal">{unavailableLabel}</span>
    </span>
  );
}
