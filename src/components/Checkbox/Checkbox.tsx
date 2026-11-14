import { Check } from 'lucide-react';
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import styles from './Checkbox.module.css';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
}

export function Checkbox({ label, description, id, ...inputProps }: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;

  return (
    <div className={styles.root}>
      <span className={styles.boxWrap}>
        <input id={inputId} type="checkbox" className={styles.input} aria-describedby={descriptionId} {...inputProps} />
        <span className={styles.box} aria-hidden="true">
          <Check size={12} strokeWidth={3} />
        </span>
      </span>
      <span className={styles.text}>
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
        {description && (
          <span id={descriptionId} className={styles.description}>
            {description}
          </span>
        )}
      </span>
    </div>
  );
}
