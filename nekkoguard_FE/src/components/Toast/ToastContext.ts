import { createContext } from 'react';

export type ToastTone = 'success' | 'info' | 'warning' | 'danger';

export interface ToastInput {
  tone: ToastTone;
  title: string;
  description?: string;
}

export interface ToastContextValue {
  notify: (toast: ToastInput) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
