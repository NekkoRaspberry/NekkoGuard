import { createContext } from 'react';
import type { AllauthUser, Flow, FlowId, SessionEnvelope } from '@/api/types';

export type AuthStatus = 'authenticated' | 'unauthenticated';

/** Why the user was signed out — drives the message on the login page. */
export type SignOutReason = 'user' | 'expired';

export interface AuthContextValue {
  status: AuthStatus;
  isAuthenticated: boolean;
  /** The allauth user (id, display, primary email) when signed in. */
  user: AllauthUser | null;
  /** Flows the server offers; one may be pending (e.g. mfa_authenticate after a password login). */
  flows: Flow[];
  pendingFlow: FlowId | null;
  lastSignOutReason: SignOutReason | null;
  /** Store the session state returned by any authentication endpoint. */
  applySession: (envelope: SessionEnvelope) => void;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
