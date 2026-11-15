import type { OrganizationDetailDto } from '@/api/tenancy';
import { PERMISSIONS, TENANT_PERMISSIONS } from '@/features/tenancy/model';

export interface OrganizationCapabilities {
  canEdit: boolean;
  canToggleActive: boolean;
  /** See members, invitations and permissions (read-only unless canManageAccess). */
  canViewAccess: boolean;
  canManageAccess: boolean;
  canViewActivity: boolean;
}

/**
 * What the UI may offer for one Organization, from backend-resolved permissions:
 * the caller's own effective permissions there, or their Tenant administration rights.
 * Mirrors the backend view requirements; the backend still checks every request.
 */
const NO_TENANT_RIGHTS: ReadonlySet<string> = new Set();

export function organizationCapabilities(
  organization: OrganizationDetailDto,
  tenantPermissions: ReadonlySet<string>,
): OrganizationCapabilities {
  const own = new Set(organization.my_access?.permissions ?? []);
  // Tenant rights count only in Organizations of the caller's organization scope.
  if (!organization.can_administer) tenantPermissions = NO_TENANT_RIGHTS;
  const canManageAccess = own.has(PERMISSIONS.manageMembers) || tenantPermissions.has(TENANT_PERMISSIONS.manageMembers);
  return {
    canEdit: own.has(PERMISSIONS.manageOrganization) || tenantPermissions.has(TENANT_PERMISSIONS.manageOrganizations),
    canToggleActive: tenantPermissions.has(TENANT_PERMISSIONS.manageOrganizations),
    canViewAccess: canManageAccess || own.has(PERMISSIONS.viewMembers),
    canManageAccess,
    canViewActivity: own.has(PERMISSIONS.viewActivity) || tenantPermissions.has(TENANT_PERMISSIONS.viewActivity),
  };
}

/**
 * Appearance Admin rights (mirrors nekkoguard/organizations/api/appearance.py).
 * Presentation only: the backend validates the Tenant/Organization of every request.
 */
export function canManageTenantAppearance(tenantPermissions: ReadonlySet<string>, isPlatformAdmin: boolean): boolean {
  return isPlatformAdmin || tenantPermissions.has(TENANT_PERMISSIONS.manageAppearance);
}

export function canManageOrganizationAppearance(
  organizationPermissions: ReadonlySet<string>,
  tenantPermissions: ReadonlySet<string>,
  isPlatformAdmin: boolean,
): boolean {
  return (
    canManageTenantAppearance(tenantPermissions, isPlatformAdmin) ||
    organizationPermissions.has(PERMISSIONS.manageAppearance)
  );
}
