import { isUuid, type Selection, type SelectionDefaults } from './selection';

/**
 * Last chosen Tenant / Organization per browser — a convenience only. These values are
 * re-validated against the backend's lists before use; storage failures are ignored.
 */
const TENANT_KEY = 'nekkoguard.context.tenant';
const ORG_KEY = 'nekkoguard.context.orgByTenant';

export function readDefaults(): SelectionDefaults {
  try {
    const tenant = window.localStorage.getItem(TENANT_KEY);
    const parsed: unknown = JSON.parse(window.localStorage.getItem(ORG_KEY) ?? '{}');
    const orgByTenant: Record<string, string> = {};
    if (typeof parsed === 'object' && parsed !== null) {
      for (const [key, value] of Object.entries(parsed)) {
        if (isUuid(key) && typeof value === 'string' && isUuid(value)) orgByTenant[key] = value;
      }
    }
    return { tenant: isUuid(tenant) ? tenant : null, orgByTenant };
  } catch {
    return { tenant: null, orgByTenant: {} };
  }
}

export function rememberSelection(selection: Selection): void {
  try {
    if (!selection.tenant) return;
    window.localStorage.setItem(TENANT_KEY, selection.tenant);
    if (selection.org) {
      const { orgByTenant } = readDefaults();
      window.localStorage.setItem(ORG_KEY, JSON.stringify({ ...orgByTenant, [selection.tenant]: selection.org }));
    }
  } catch {
    // preference simply won't persist
  }
}
