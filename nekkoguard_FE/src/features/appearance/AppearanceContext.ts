import { createContext } from 'react';
import type { NavbarPosition, ResolvedValues } from '@/api/appearance';

export interface AppearanceContextValue {
  /** Effective appearance of the current context; null = NekkoGuard defaults. */
  effective: ResolvedValues | null;
  /** Custom application title, or null to show the NekkoGuard branding. */
  title: string | null;
  logoUrl: string | null;
  navbarPosition: NavbarPosition;
}

export const DEFAULT_APPEARANCE_CONTEXT: AppearanceContextValue = {
  effective: null,
  title: null,
  logoUrl: null,
  navbarPosition: 'left',
};

export const AppearanceContext = createContext<AppearanceContextValue>(DEFAULT_APPEARANCE_CONTEXT);
