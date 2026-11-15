import type { FlowId } from '@/api/types';

/** Frontend route paths — one place, no string literals scattered in components. */
export const ROUTES = {
  // Public (signed out)
  login: '/login',
  loginMfa: '/login/2fa',
  signup: '/signup',
  verifyEmailPending: '/verify-email',
  forgotPassword: '/forgot-password',
  providerSignup: '/signup/provider',
  // Provider redirect returns here (public; any state)
  providerCallback: '/auth/callback',
  // Opened from email links (any state). Must match HEADLESS_FRONTEND_URLS in the backend.
  verifyEmail: (key: string) => `/verify-email/${encodeURIComponent(key)}`,
  resetPassword: (key: string) => `/reset-password/${encodeURIComponent(key)}`,
  // Organization invitation link from email (any state). Built by the backend (api/views.py).
  invitation: (token: string) => `/invitations/${encodeURIComponent(token)}`,
  // Signed in
  overview: '/',
  // Infrastructure (current Organization from the context bar)
  infrastructure: '/infrastructure',
  // Settings → Tenant (the Tenant selected in the context bar)
  settings: '/settings',
  tenantSettings: '/settings/tenant',
  tenantOrganizations: '/settings/tenant/organizations',
  // One Organization, managed from the Tenant: passed as navigation state, never in the URL.
  tenantOrganization: '/settings/tenant/organizations/manage',
  tenantOrganizationAppearance: '/settings/tenant/organizations/manage/appearance',
  tenantMembers: '/settings/tenant/members',
  tenantActivity: '/settings/tenant/activity',
  tenantAppearance: '/settings/tenant/appearance',
  // Settings → Organization (the Organization selected in the context bar)
  organizationSettings: '/settings/organization',
  organizationMembers: '/settings/organization/members',
  organizationAccess: '/settings/organization/access',
  organizationActivity: '/settings/organization/activity',
  organizationAppearance: '/settings/organization/appearance',
  // Settings → Profile (the signed-in user; independent of Tenant/Organization)
  profile: '/settings/profile',
  security: '/settings/profile/security',
  connectedApps: '/settings/profile/applications',
} as const;

/** Former account URLs (bookmarks, older links) → their Settings → Profile page. */
export const LEGACY_ACCOUNT_ROUTES = {
  '/account': ROUTES.profile,
  '/account/profile': ROUTES.profile,
  '/account/security': ROUTES.security,
  '/account/connected-apps': ROUTES.connectedApps,
} as const;

/** Where to send the user when the server reports a pending authentication step. */
export function routeForPendingFlow(flow: FlowId | null): string | null {
  if (flow === 'mfa_authenticate') return ROUTES.loginMfa;
  if (flow === 'verify_email') return ROUTES.verifyEmailPending;
  if (flow === 'provider_signup') return ROUTES.providerSignup;
  return null;
}
