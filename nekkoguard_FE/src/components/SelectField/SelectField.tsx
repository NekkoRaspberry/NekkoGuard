import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import fieldStyles from '../TextField/TextField.module.css';
import styles from './SelectField.module.css';

export interface SelectOption<V extends string> {
  value: V;
  label: string;
}

interface SelectFieldProps<V extends string> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  label: string;
  value: V;
  options: readonly SelectOption<V>[];
  onChange: (value: V) => void;
  hint?: ReactNode;
  error?: string | null;
}

/** Native <select> styled like TextField (keyboard and screen-reader friendly). */
export function SelectField<V extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  error,
  id,
  className,
  ...rest
}: SelectFieldProps<V>) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;

  return (
    <div className={cx(fieldStyles.field, className)}>
      <div className={fieldStyles.labelRow}>
        <label htmlFor={selectId} className={fieldStyles.label}>
          {label}
        </label>
      </div>
      <div className={cx(fieldStyles.control, error && fieldStyles.invalid)}>
        <select
          id={selectId}
          className={cx(fieldStyles.input, styles.select)}
          value={value}
          onChange={(event) => {
            const next = options.find((option) => option.value === event.target.value);
            if (next) onChange(next.value);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={[errorId, hintId].filter(Boolean).join(' ') || undefined}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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
}
