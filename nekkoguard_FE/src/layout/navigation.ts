import {
  AppWindow,
  Building2,
  Layers,
  LayoutDashboard,
  MapPin,
  ServerCog,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { PERMISSIONS } from '@/features/tenancy/model';

/** What the signed-in user can see, from backend-resolved data (presentation only). */
export interface NavAccess {
  permissions: ReadonlySet<string>;
  hasOrganization: boolean;
  hasTenantMembership: boolean;
  isPlatformAdmin: boolean;
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
        label: 'Organization',
        to: ROUTES.organizationSettings,
        icon: Building2,
        visible: ({ hasOrganization }) => hasOrganization,
      },
      {
        label: 'Tenant',
        to: ROUTES.tenantSettings,
        icon: Layers,
        visible: ({ hasTenantMembership }) => hasTenantMembership,
      },
      {
        label: 'Platform',
        to: ROUTES.platformTenants,
        icon: ServerCog,
        visible: ({ isPlatformAdmin }) => isPlatformAdmin,
      },
    ],
  },
  {
    label: 'Account',
    items: [
      { label: 'Profile', to: ROUTES.profile, icon: UserRound },
      { label: 'Security', to: ROUTES.security, icon: ShieldCheck },
      { label: 'Connected apps', to: ROUTES.connectedApps, icon: AppWindow },
    ],
  },
];

export function visibleNavigation(access: NavAccess): NavGroup[] {
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.visible?.(access) ?? true),
  })).filter((group) => group.items.length > 0);
}
