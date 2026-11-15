import { forwardRef, useId, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import fieldStyles from '../TextField/TextField.module.css';
import styles from './TextAreaField.module.css';

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Shown next to the label, e.g. "Optional". */
  labelAction?: ReactNode;
}

/** Multi-line counterpart of TextField: same label, hint, error and focus styles. */
export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(function TextAreaField(
  { label, hint, error, labelAction, id, className, rows = 4, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cx(fieldStyles.field, className)}>
      <div className={fieldStyles.labelRow}>
        <label htmlFor={inputId} className={fieldStyles.label}>
          {label}
        </label>
        {labelAction}
      </div>
      <div className={cx(fieldStyles.control, styles.control, error && fieldStyles.invalid)}>
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          className={styles.textarea}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
        />
      </div>
      {error && (
        <p id={errorId} className={fieldStyles.error} role="alert">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className={fieldStyles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
});
