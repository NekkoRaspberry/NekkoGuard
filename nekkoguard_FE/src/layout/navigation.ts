import { Building2, Layers, LayoutDashboard, MapPin, UserRound, type LucideIcon } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { PERMISSIONS } from '@/features/tenancy/model';

/** What the signed-in user can see, from backend-resolved data (presentation only). */
export interface NavAccess {
  permissions: ReadonlySet<string>;
  hasOrganization: boolean;
  /** Tenant administrator (see canAdministerTenant). */
  canAdministerTenant: boolean;
}

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Match only the exact path (needed for "/"). */
  end?: boolean;
  /** Hidden when this returns false. The backend still enforces access. */
  visible?: (access: NavAccess) => boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Navigation reflects only what the backend implements today.
 * New modules are added here when their backend APIs exist.
 *
 * Settings has one entry per context, always in this order: the selected Tenant, the
 * selected Organization, and the signed-in user's Profile. Each opens its own settings
 * area (with its own pages, e.g. Appearance or Security); nothing is duplicated here.
 * Platform administration (creating/deactivating Tenants) is Django admin only.
 */
export const NAVIGATION: NavGroup[] = [
  {
    label: 'General',
    items: [{ label: 'Overview', to: ROUTES.overview, icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Infrastructure',
    items: [
      {
        label: 'Sites & networks',
        to: ROUTES.infrastructure,
        icon: MapPin,
        visible: ({ permissions }) =>
          permissions.has(PERMISSIONS.viewSites) || permissions.has(PERMISSIONS.viewNetworks),
      },
    ],
  },
  {
    label: 'Settings',
    items: [
      {
        label: 'Tenant',
        to: ROUTES.tenantSettings,
        icon: Layers,
        visible: ({ canAdministerTenant }) => canAdministerTenant,
      },
      {
        label: 'Organization',
        to: ROUTES.organizationSettings,
        icon: Building2,
        visible: ({ hasOrganization }) => hasOrganization,
      },
      { label: 'Profile', to: ROUTES.profile, icon: UserRound },
    ],
  },
];

export function visibleNavigation(access: NavAccess): NavGroup[] {
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.visible?.(access) ?? true),
  })).filter((group) => group.items.length > 0);
}
