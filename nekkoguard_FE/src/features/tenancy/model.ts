import type { OrganizationAccess, OrganizationRole, PermissionSource, TenantRole } from '@/api/tenancy';

/**
 * Permission keys and labels for the UI.
 *
 * Mirrors `nekkoguard/organizations/roles.py`. The frontend never decides access: it
 * only shows/hides controls from the permissions the backend resolved.
 */
export const PERMISSIONS = {
  manageOrganization: 'organization.manage',
  manageMembers: 'members.manage',
  viewSites: 'sites.view',
  manageSites: 'sites.manage',
  viewNetworks: 'networks.view',
  manageNetworks: 'networks.manage',
  viewActivity: 'activity.view',
} as const;
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const TENANT_PERMISSIONS = {
  view: 'tenant.view',
  manage: 'tenant.manage',
  manageMembers: 'tenant.members.manage',
  manageOrganizations: 'tenant.organizations.manage',
  viewActivity: 'tenant.activity.view',
} as const;
export type TenantPermission = (typeof TENANT_PERMISSIONS)[keyof typeof TENANT_PERMISSIONS];

export const PERMISSION_LABELS: Record<string, string> = {
  'organization.manage': 'Manage organization settings',
  'members.manage': 'Manage members and permissions',
  'sites.view': 'View sites',
  'sites.manage': 'Manage sites',
  'networks.view': 'View networks',
  'networks.manage': 'Manage networks',
  'activity.view': 'View activity history',
};

export const permissionLabel = (permission: string): string => PERMISSION_LABELS[permission] ?? permission;

export const TENANT_ROLE_LABELS: Record<TenantRole, string> = {
  owner: 'Tenant owner',
  admin: 'Tenant administrator',
  member: 'Tenant member',
};

export const ORGANIZATION_ROLE_LABELS: Record<OrganizationRole, string> = {
  owner: 'Organization owner',
  admin: 'Organization administrator',
  security_analyst: 'Security analyst',
  operator: 'Operator',
  viewer: 'Viewer',
};

export const ORGANIZATION_ACCESS_LABELS: Record<OrganizationAccess, string> = {
  all: 'All organizations',
  selected: 'Selected organizations',
  none: 'No organizations',
};

export const SOURCE_LABELS: Record<PermissionSource, string> = {
  override: 'Organization override',
  organization_role: 'Organization role',
  tenant_role: 'Inherited from tenant',
  none: 'Not granted',
};

export const TENANT_ROLES = Object.keys(TENANT_ROLE_LABELS) as TenantRole[];
export const ORGANIZATION_ROLES = Object.keys(ORGANIZATION_ROLE_LABELS) as OrganizationRole[];
export const ORGANIZATION_ACCESS_OPTIONS = Object.keys(ORGANIZATION_ACCESS_LABELS) as OrganizationAccess[];
