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
  viewMembers: 'members.view',
  viewActivity: 'activity.view',
  manageAppearance: 'organization.appearance.manage',
} as const;
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const TENANT_PERMISSIONS = {
  view: 'tenant.view',
  manage: 'tenant.manage',
  manageMembers: 'tenant.members.manage',
  manageOrganizations: 'tenant.organizations.manage',
  viewActivity: 'tenant.activity.view',
  manageAppearance: 'tenant.appearance.manage',
} as const;
export type TenantPermission = (typeof TENANT_PERMISSIONS)[keyof typeof TENANT_PERMISSIONS];

/**
 * Tenant settings are for its administrators: anyone holding a Tenant right beyond
 * merely seeing it (Administrator). Organization roles — Administrator,
 * Security Analyst, Operator, Viewer — and plain Tenant members never see them.
 */
export function canAdministerTenant(tenantPermissions: ReadonlySet<string>): boolean {
  return [...tenantPermissions].some((p) => p !== TENANT_PERMISSIONS.view && p.startsWith('tenant.'));
}

export const PERMISSION_LABELS: Record<string, string> = {
  'organization.manage': 'Manage organization settings',
  'members.manage': 'Manage members and permissions',
  'sites.view': 'View sites',
  'sites.manage': 'Manage sites',
  'networks.view': 'View networks',
  'networks.manage': 'Manage networks',
  'members.view': 'View members and permissions',
  'activity.view': 'View activity history',
  'organization.appearance.manage': 'Manage appearance (branding only)',
};

export const permissionLabel = (permission: string): string => PERMISSION_LABELS[permission] ?? permission;

export const TENANT_ROLE_LABELS: Record<TenantRole, string> = {
  admin: 'Tenant administrator',
  member: 'Tenant member',
};

export const ORGANIZATION_ROLE_LABELS: Record<OrganizationRole, string> = {
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

/** Where an effective permission comes from; Tenant-inherited ones name the Tenant. */
export function sourceLabel(source: PermissionSource, tenantName: string): string {
  const labels: Record<PermissionSource, string> = {
    override: 'Organization override',
    organization_role: 'Organization role',
    tenant_role: `Inherited from ${tenantName}`,
    none: 'Not granted',
  };
  return labels[source];
}

export const TENANT_ROLES = Object.keys(TENANT_ROLE_LABELS) as TenantRole[];
export const ORGANIZATION_ROLES = Object.keys(ORGANIZATION_ROLE_LABELS) as OrganizationRole[];
export const ORGANIZATION_ACCESS_OPTIONS = Object.keys(ORGANIZATION_ACCESS_LABELS) as OrganizationAccess[];
