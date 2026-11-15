import { useImpersonation } from '@/features/impersonation/useImpersonation';
import { useTenancy } from '@/features/tenancy/hooks';
import { canAdministerTenant } from '@/features/tenancy/model';
import { visibleNavigation, type NavGroup } from './navigation';

/** Navigation groups visible to the signed-in user in the current context. */
export function useNavigation(): NavGroup[] {
  const { permissions, currentOrganization, tenantPermissions } = useTenancy();
  const viewingAs = useImpersonation().data?.active === true;
  return visibleNavigation({
    permissions,
    hasOrganization: currentOrganization !== null,
    canAdministerTenant: canAdministerTenant(tenantPermissions),
    canReportBugs: !viewingAs,
  });
}
