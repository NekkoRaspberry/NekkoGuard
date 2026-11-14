import styles from './Spinner.module.css';

interface SpinnerProps {
  size?: 16 | 20 | 24;
  tone?: 'primary' | 'onAccent' | 'muted';
  label?: string;
}

export function Spinner({ size = 20, tone = 'primary', label }: SpinnerProps) {
  return (
    <span
      className={`${styles.spinner} ${styles[tone]}`}
      style={{ width: size, height: size }}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
