import { isUuid, type Selection, type SelectionDefaults } from './selection';

/**
 * Rule 1: the last chosen Tenant / Organization, remembered per user in this browser
 * (so it survives closing the app, and one user's choice never decides where another
 * user lands). A convenience only: values are re-validated against the backend's
 * lists before use; storage failures are ignored.
 */
const PREFIX = 'nekkoguard.context';
const tenantKey = (userId: number) => `${PREFIX}.${userId}.tenant`;
const orgKey = (userId: number) => `${PREFIX}.${userId}.orgByTenant`;
const NONE: SelectionDefaults = { tenant: null, orgByTenant: {} };

export function readDefaults(userId: number | null): SelectionDefaults {
  if (userId === null) return NONE;
  try {
    const tenant = window.localStorage.getItem(tenantKey(userId));
    const parsed: unknown = JSON.parse(window.localStorage.getItem(orgKey(userId)) ?? '{}');
    const orgByTenant: Record<string, string> = {};
    if (typeof parsed === 'object' && parsed !== null) {
      for (const [key, value] of Object.entries(parsed)) {
        if (isUuid(key) && typeof value === 'string' && isUuid(value)) orgByTenant[key] = value;
      }
    }
    return { tenant: isUuid(tenant) ? tenant : null, orgByTenant };
  } catch {
    return NONE;
  }
}

export function rememberSelection(selection: Selection, userId: number | null): void {
  if (userId === null || !selection.tenant) return;
  try {
    window.localStorage.setItem(tenantKey(userId), selection.tenant);
    if (selection.org) {
      const { orgByTenant } = readDefaults(userId);
      window.localStorage.setItem(orgKey(userId), JSON.stringify({ ...orgByTenant, [selection.tenant]: selection.org }));
    }
    // Pre-per-user keys (shared by every user of the browser) are no longer used.
    window.localStorage.removeItem(`${PREFIX}.tenant`);
    window.localStorage.removeItem(`${PREFIX}.orgByTenant`);
  } catch {
    // preference simply won't persist
  }
}
