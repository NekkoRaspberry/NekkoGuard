import { createContext } from 'react';
import type { Flow } from '@/api/types';

export interface ReauthContextValue {
  /** Ask the user to confirm their identity. Resolves when done, rejects if cancelled. */
  requestReauth: (flows: Flow[]) => Promise<void>;
}

export const ReauthContext = createContext<ReauthContextValue | null>(null);

export class ReauthCancelledError extends Error {
  constructor() {
    super('Confirmation cancelled.');
    this.name = 'ReauthCancelledError';
  }
}

export function isReauthCancelled(error: unknown): error is ReauthCancelledError {
  return error instanceof ReauthCancelledError;
}
