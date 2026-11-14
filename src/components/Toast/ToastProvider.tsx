import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { ToastContext, type ToastInput, type ToastTone } from './ToastContext';
import styles from './Toast.module.css';

interface ToastItem extends ToastInput {
  id: number;
}

const AUTO_DISMISS_MS = 5_000;
const MAX_VISIBLE = 4;

const ICONS: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 size={16} />,
  info: <Info size={16} />,
  warning: <AlertTriangle size={16} />,
  danger: <XCircle size={16} />,
};

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  // Errors stay until dismissed (spec 6.5); everything else auto-dismisses.
  useEffect(() => {
    if (toast.tone === 'danger') return;
    const timer = window.setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.tone, onDismiss]);

  return (
    <div className={cx(styles.toast, styles[toast.tone])} role={toast.tone === 'danger' ? 'alert' : 'status'}>
      <span className={styles.icon}>{ICONS[toast.tone]}</span>
      <div className={styles.content}>
        <p className={styles.title}>{toast.title}</p>
        {toast.description && <p className={styles.description}>{toast.description}</p>}
      </div>
      <button type="button" className={styles.close} onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { ...toast, id }].slice(-MAX_VISIBLE));
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.viewport} aria-live="polite">
        {toasts.map((toast) => (
          <ToastView key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
