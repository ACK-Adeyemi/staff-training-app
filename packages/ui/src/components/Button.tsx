import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';

export const focusClasses =
  'focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]';
const base =
  'inline-flex min-h-[var(--target-min)] min-w-[var(--target-min)] items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-2 font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 transition-colors ' +
  focusClasses;

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--color-accent)] text-[var(--color-on-accent)] border-2 border-[var(--color-accent)]',
  secondary: 'bg-[var(--color-surface)] text-[var(--color-text)] border-2 border-[var(--color-border)]',
  quiet: 'bg-transparent text-[var(--color-accent)] border-2 border-transparent underline',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = 'primary', type = 'button', className, ...rest }: ButtonProps) {
  return <button type={type} className={[base, variants[variant], className].filter(Boolean).join(' ')} {...rest} />;
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  label: string;
  icon: IconName;
  variant?: ButtonVariant;
}

export function IconButton({ label, icon, variant = 'quiet', type = 'button', className, ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={[base, 'px-2', variants[variant], className].filter(Boolean).join(' ')}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}

export interface LinkButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
}

/** Router-agnostic link styled as a button. */
export function LinkButton({ variant = 'primary', className, ...rest }: LinkButtonProps) {
  return <a className={[base, variants[variant], className].filter(Boolean).join(' ')} {...rest} />;
}
