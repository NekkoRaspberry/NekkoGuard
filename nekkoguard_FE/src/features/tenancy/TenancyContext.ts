import { createContext } from 'react';
import type { NetworkDto, OrganizationDetailDto, OrganizationDto, SiteDto, TenantDto } from '@/api/tenancy';
import type { Level, Selection } from './selection';

export interface TenancyContextValue {
  /** Validated selection (only ids the backend listed for this user). */
  selection: Selection;
  /** False while the selection is still being validated: render nothing scoped yet. */
  ready: boolean;
  tenants: TenantDto[] | undefined;
  tenantsError: unknown;
  retryTenants: () => void;
  currentTenant: TenantDto | null;
  /** Active Organizations of the current Tenant that the user reaches. */
  organizations: OrganizationDto[] | undefined;
  currentOrganization: OrganizationDetailDto | null;
  organizationLoading: boolean;
  organizationError: unknown;
  /** Sites/networks for the selectors (undefined when not permitted or loading). */
  sites: SiteDto[] | undefined;
  networks: NetworkDto[] | undefined;
  /** Effective Organization permissions resolved by the backend. */
  permissions: ReadonlySet<string>;
  /** Tenant permissions from the user's Tenant role (empty for Organization-only users). */
  tenantPermissions: ReadonlySet<string>;
  /** Switches one level (resets the levels below it). */
  select: (level: Level, id: string | null) => void;
}

export const TenancyContext = createContext<TenancyContextValue | null>(null);
