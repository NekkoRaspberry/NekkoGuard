import type { MyOrganizationDto } from '@/api/tenancy';

export interface OrganizationGroup {
  tenantId: string;
  tenantName: string;
  organizations: MyOrganizationDto[];
}

/**
 * Organizations grouped under their Tenant, in the backend's order (Tenant name, then
 * Organization name). `query` matches the Organization or the Tenant name.
 */
export function groupOrganizations(organizations: readonly MyOrganizationDto[], query = ''): OrganizationGroup[] {
  const needle = query.trim().toLowerCase();
  const groups: OrganizationGroup[] = [];
  for (const org of organizations) {
    const matches = !needle || org.name.toLowerCase().includes(needle) || org.tenant_name.toLowerCase().includes(needle);
    if (!matches) continue;
    let group = groups.at(-1);
    if (group?.tenantId !== org.tenant) {
      group = { tenantId: org.tenant, tenantName: org.tenant_name, organizations: [] };
      groups.push(group);
    }
    group.organizations.push(org);
  }
  return groups;
}
