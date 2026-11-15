import type { ResolvedValues } from '@/api/appearance';

/**
 * Last effective appearance seen in this browser, reused only for the very same
 * Tenant/Organization while it is reloaded (avoids a flash of the default theme).
 * Never used for another context, and cleared when the app shell unmounts (sign-out).
 */
const KEY = 'nekkoguard.appearance';

export const scopeKey = (tenantId: string | null, orgId: string | null) => (tenantId ? `${tenantId}:${orgId ?? ''}` : null);

export function readCachedAppearance(key: string | null): ResolvedValues | null {
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as { key?: string; effective?: ResolvedValues }) : null;
    return parsed?.key === key && parsed.effective ? parsed.effective : null;
  } catch {
    return null;
  }
}

export function writeCachedAppearance(key: string, effective: ResolvedValues | null): void {
  try {
    if (effective) window.localStorage.setItem(KEY, JSON.stringify({ key, effective }));
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage unavailable (private mode…): only the anti-flash cache is lost
  }
}

export function clearCachedAppearance(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
