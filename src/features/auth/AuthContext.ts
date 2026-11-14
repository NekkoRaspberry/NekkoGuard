import { createContext } from 'react';
import type { StoredSession } from './tokenStorage';

/** Why the user was signed out — drives the message on the login page. */
export type SignOutReason = 'user' | 'expired';

export interface SignInInput {
  email: string;
  password: string;
  remember: boolean;
}

export interface AuthContextValue {
  session: Omit<StoredSession, 'token'> | null;
  isAuthenticated: boolean;
  lastSignOutReason: SignOutReason | null;
  signIn: (input: SignInInput) => Promise<void>;
  signOut: (reason?: SignOutReason) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
