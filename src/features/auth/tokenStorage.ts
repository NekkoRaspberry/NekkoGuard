/**
 * Stores the DRF API token for this browser.
 *
 * - Default: sessionStorage (cleared when the browser/tab closes).
 * - "Keep me signed in": localStorage.
 *
 * The backend tokens never expire on their own, so the conservative default matters.
 * Every storage access is guarded: private mode or blocked storage must not crash the app.
 */

export type TokenPersistence = 'session' | 'persistent';

export interface StoredSession {
  token: string;
  /** Email typed at sign-in. The API does not return the email, so this is what we display. */
  email: string;
  persistence: TokenPersistence;
}

const STORAGE_KEY = 'nekkoguard.session';

function getStore(persistence: TokenPersistence): Storage | null {
  try {
    return persistence === 'persistent' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.token === 'string' &&
    candidate.token.length > 0 &&
    typeof candidate.email === 'string' &&
    (candidate.persistence === 'session' || candidate.persistence === 'persistent')
  );
}

function readFrom(persistence: TokenPersistence): StoredSession | null {
  const store = getStore(persistence);
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function removeFrom(persistence: TokenPersistence): void {
  try {
    getStore(persistence)?.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable — nothing to remove
  }
}

export const tokenStorage = {
  read(): StoredSession | null {
    return readFrom('session') ?? readFrom('persistent');
  },

  getToken(): string | null {
    return this.read()?.token ?? null;
  },

  /** Returns false when the browser refuses to store anything. */
  write(session: StoredSession): boolean {
    this.clear();
    const store = getStore(session.persistence);
    if (!store) return false;
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(session));
      return true;
    } catch {
      return false;
    }
  },

  clear(): void {
    removeFrom('session');
    removeFrom('persistent');
  },
};
