import { AppWindow, LayoutDashboard, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';
import { ROUTES } from '@/app/routes';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Match only the exact path (needed for "/"). */
  end?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Navigation reflects only what the backend implements today (user accounts).
 * New modules are added here when their backend APIs exist.
 */
export const NAVIGATION: NavGroup[] = [
  {
    label: 'General',
    items: [{ label: 'Overview', to: ROUTES.overview, icon: LayoutDashboard, end: true }],
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
