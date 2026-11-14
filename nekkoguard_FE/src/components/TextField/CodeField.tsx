import { forwardRef } from 'react';
import { TextField, type TextFieldProps } from './TextField';
import styles from './TextField.module.css';

interface CodeFieldProps extends Omit<TextFieldProps, 'type' | 'inputMode' | 'autoComplete'> {
  /** Accept recovery codes (alphanumeric) instead of 6-digit authenticator codes. */
  allowAlphanumeric?: boolean;
}

/** One-time code input (authenticator app codes, recovery codes). Paste-friendly. */
export const CodeField = forwardRef<HTMLInputElement, CodeFieldProps>(function CodeField(
  { allowAlphanumeric = false, className, ...props },
  ref,
) {
  return (
    <TextField
      ref={ref}
      {...props}
      className={className}
      type="text"
      inputMode={allowAlphanumeric ? 'text' : 'numeric'}
      autoComplete="one-time-code"
      autoCapitalize="off"
      spellCheck={false}
      maxLength={allowAlphanumeric ? 32 : 6}
      placeholder={allowAlphanumeric ? 'xxxxxxxx' : '000000'}
      inputClassName={styles.code}
    />
  );
});
