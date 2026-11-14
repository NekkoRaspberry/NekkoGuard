import { Eye, EyeOff, Lock } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { TextField, type TextFieldProps } from './TextField';
import styles from './TextField.module.css';

type PasswordFieldProps = Omit<TextFieldProps, 'type' | 'rightSlot' | 'leftSlot'>;

/** Password input with a lock icon and a show/hide toggle. */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(props, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      ref={ref}
      {...props}
      type={visible ? 'text' : 'password'}
      leftSlot={<Lock size={16} />}
      rightSlot={
        <button
          type="button"
          className={styles.reveal}
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          tabIndex={-1}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      }
    />
  );
});
