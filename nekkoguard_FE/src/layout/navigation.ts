import { Bug, Building2, FileText, Layers, LayoutDashboard, MapPin, Rocket, UserRound, type LucideIcon } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { PERMISSIONS } from '@/features/tenancy/model';

/** What the signed-in user can see, from backend-resolved data (presentation only). */
export interface NavAccess {
  permissions: ReadonlySet<string>;
  hasOrganization: boolean;
  /** Tenant administrator (see canAdministerTenant). */
  canAdministerTenant: boolean;
  /** False while viewing as another user (read-only: reports are sent as yourself). */
  canReportBugs: boolean;
}

interface NavItemBase {
  label: string;
  icon: LucideIcon;
  /** Hidden when this returns false. The backend still enforces access. */
  visible?: (access: NavAccess) => boolean;
}

/** A page. */
export interface NavLinkItem extends NavItemBase {
  kind?: 'link';
  to: string;
  /** Match only the exact path (needed for "/"). */
  end?: boolean;
}

/** Opens something in place instead of a page (e.g. the Report a bug dialog). */
export type NavAction = 'reportBug';
export interface NavActionItem extends NavItemBase {
  kind: 'action';
  action: NavAction;
}

export type NavItem = NavLinkItem | NavActionItem;

export const isLinkItem = (item: NavItem): item is NavLinkItem => item.kind !== 'action';
export const navItemKey = (item: NavItem): string => (isLinkItem(item) ? item.to : `action:${item.action}`);

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
 *
 * Software: about NekkoGuard itself (release notes, terms) and reporting a bug.
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
  {
    label: 'Software',
    items: [
      { label: 'Release versions', to: ROUTES.helpReleases, icon: Rocket },
      { label: 'Terms of service', to: ROUTES.helpTerms, icon: FileText },
      {
        label: 'Report a bug',
        kind: 'action',
        action: 'reportBug',
        icon: Bug,
        visible: ({ canReportBugs }) => canReportBugs,
      },
    ],
  },
];

export function visibleNavigation(access: NavAccess): NavGroup[] {
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.visible?.(access) ?? true),
  })).filter((group) => group.items.length > 0);
}
