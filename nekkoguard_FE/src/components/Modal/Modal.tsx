import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './Modal.module.css';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md';
  /** Block closing by Esc / outside click / × (e.g. while showing codes that must be saved). */
  dismissible?: boolean;
}

/** Accessible modal dialog (focus trap, Esc, scroll lock) on Radix Dialog. */
export function Modal({ open, onOpenChange, title, description, icon, children, footer, size = 'sm', dismissible = true }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => (dismissible || next ? onOpenChange(next) : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={cx(styles.content, styles[size])}
          onEscapeKeyDown={(event) => !dismissible && event.preventDefault()}
          onPointerDownOutside={(event) => !dismissible && event.preventDefault()}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <header className={styles.header}>
            {icon && <span className={styles.icon}>{icon}</span>}
            <div className={styles.titles}>
              <Dialog.Title className={styles.title}>{title}</Dialog.Title>
              {description && <Dialog.Description className={styles.description}>{description}</Dialog.Description>}
            </div>
            {dismissible && (
              <Dialog.Close className={styles.close} aria-label="Close">
                <X size={16} />
              </Dialog.Close>
            )}
          </header>
          {children && <div className={styles.body}>{children}</div>}
          {footer && <footer className={styles.footer}>{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
