import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './TextField.module.css';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Element rendered inside the input on the left (e.g. an icon). */
  leftSlot?: ReactNode;
  /** Element rendered inside the input on the right (e.g. a show-password toggle). */
  rightSlot?: ReactNode;
  /** Extra content aligned to the right of the label (e.g. "Forgot password?"). */
  labelAction?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, leftSlot, rightSlot, labelAction, id, className, readOnly, ...inputProps },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cx(styles.field, className)}>
      <div className={styles.labelRow}>
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
        {labelAction}
      </div>
      <div
        className={cx(
          styles.control,
          error && styles.invalid,
          readOnly && styles.readOnly,
          leftSlot !== undefined && styles.hasLeft,
          rightSlot !== undefined && styles.hasRight,
        )}
      >
        {leftSlot !== undefined && <span className={styles.leftSlot}>{leftSlot}</span>}
        <input
          ref={ref}
          id={inputId}
          className={styles.input}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          readOnly={readOnly}
          {...inputProps}
        />
        {rightSlot !== undefined && <span className={styles.rightSlot}>{rightSlot}</span>}
      </div>
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
});
