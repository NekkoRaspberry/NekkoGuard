import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cx } from '@/lib/cx';
import { Spinner } from '../Spinner/Spinner';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface StyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  iconOnly?: boolean;
}

function buttonClassName({ variant = 'secondary', size = 'md', fullWidth, iconOnly }: StyleProps, extra?: string) {
  return cx(
    styles.button,
    styles[variant],
    size !== 'md' && styles[size],
    fullWidth && styles.fullWidth,
    iconOnly && styles.icon,
    extra,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, StyleProps {
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, fullWidth, iconOnly, loading = false, leftIcon, rightIcon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClassName({ variant, size, fullWidth, iconOnly }, cx(loading && styles.loading, className))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <span className={styles.label}>
        {leftIcon}
        {children}
        {rightIcon}
      </span>
      {loading && (
        <span className={styles.spinner}>
          <Spinner size={16} tone={variant === 'primary' || variant === 'danger' ? 'onAccent' : 'primary'} />
        </span>
      )}
    </button>
  );
});

interface ButtonLinkBaseProps extends StyleProps {
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Router link styled as a button (in-app navigation). */
export function ButtonLink({
  variant,
  size,
  fullWidth,
  iconOnly,
  leftIcon,
  rightIcon,
  className,
  children,
  ...rest
}: ButtonLinkBaseProps & Omit<LinkProps, 'className' | 'children'>) {
  return (
    <Link className={buttonClassName({ variant, size, fullWidth, iconOnly }, className)} {...rest}>
      <span className={styles.label}>
        {leftIcon}
        {children}
        {rightIcon}
      </span>
    </Link>
  );
}

/** Plain anchor styled as a button (backend-hosted pages). */
export function ButtonAnchor({
  variant,
  size,
  fullWidth,
  iconOnly,
  leftIcon,
  rightIcon,
  className,
  children,
  ...rest
}: ButtonLinkBaseProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children'>) {
  return (
    <a className={buttonClassName({ variant, size, fullWidth, iconOnly }, className)} {...rest}>
      <span className={styles.label}>
        {leftIcon}
        {children}
        {rightIcon}
      </span>
    </a>
  );
}
