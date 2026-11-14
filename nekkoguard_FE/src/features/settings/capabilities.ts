import type { OrganizationDetailDto } from '@/api/tenancy';
import { PERMISSIONS, TENANT_PERMISSIONS } from '@/features/tenancy/model';

export interface OrganizationCapabilities {
  canEdit: boolean;
  canToggleActive: boolean;
  canManageAccess: boolean;
  canViewActivity: boolean;
}

/**
 * What the UI may offer for one Organization, from backend-resolved permissions:
 * the caller's own effective permissions there, or their Tenant administration rights.
 * Mirrors the backend view requirements; the backend still checks every request.
 */
export function organizationCapabilities(
  organization: OrganizationDetailDto,
  tenantPermissions: ReadonlySet<string>,
): OrganizationCapabilities {
  const own = new Set(organization.my_access?.permissions ?? []);
  return {
    canEdit: own.has(PERMISSIONS.manageOrganization) || tenantPermissions.has(TENANT_PERMISSIONS.manageOrganizations),
    canToggleActive: tenantPermissions.has(TENANT_PERMISSIONS.manageOrganizations),
    canManageAccess: own.has(PERMISSIONS.manageMembers) || tenantPermissions.has(TENANT_PERMISSIONS.manageMembers),
    canViewActivity: own.has(PERMISSIONS.viewActivity) || tenantPermissions.has(TENANT_PERMISSIONS.viewActivity),
  };
}
