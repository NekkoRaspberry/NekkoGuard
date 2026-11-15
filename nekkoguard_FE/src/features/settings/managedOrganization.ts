import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { isUuid } from '@/features/tenancy/selection';

/**
 * The Organization opened from Settings → Tenant → Organizations ("Manage").
 * Passed as navigation state and remembered for this browser tab (so a refresh keeps
 * it) — never put in the URL. The backend still checks it belongs to the Tenant.
 */
const KEY = 'nekkoguard.managedOrganization';

export interface ManagedOrganizationState {
  managedOrgId: string;
}

/** Navigation state for links to the manage pages. */
export const manageOrganization = (orgId: string): ManagedOrganizationState => ({ managedOrgId: orgId });

function readStored(): string | null {
  try {
    const value = window.sessionStorage.getItem(KEY);
    return isUuid(value) ? value : null;
  } catch {
    return null;
  }
}

export function useManagedOrganizationId(): string | null {
  const state = useLocation().state as Partial<ManagedOrganizationState> | null;
  const fromLink = isUuid(state?.managedOrgId) ? state.managedOrgId : null;

  useEffect(() => {
    if (!fromLink) return;
    try {
      window.sessionStorage.setItem(KEY, fromLink);
    } catch {
      // a refresh will simply go back to the organization list
    }
  }, [fromLink]);

  return fromLink ?? readStored();
}
