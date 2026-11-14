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
  // Signed in
  overview: '/',
  profile: '/account/profile',
  security: '/account/security',
  connectedApps: '/account/connected-apps',
} as const;

/** Where to send the user when the server reports a pending authentication step. */
export function routeForPendingFlow(flow: FlowId | null): string | null {
  if (flow === 'mfa_authenticate') return ROUTES.loginMfa;
  if (flow === 'verify_email') return ROUTES.verifyEmailPending;
  if (flow === 'provider_signup') return ROUTES.providerSignup;
  return null;
}
