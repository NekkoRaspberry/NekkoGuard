import { config } from '@/config/env';

/**
 * Account flows that the backend implements only as server-rendered pages (django-allauth).
 * The SPA links to them instead of re-implementing them; they use the backend's own
 * web session, so the server may ask the user to sign in there as well.
 */
const PATHS = {
  signup: '/accounts/signup/',
  passwordReset: '/accounts/password/reset/',
  passwordChange: '/accounts/password/change/',
  emailAddresses: '/accounts/email/',
  twoFactor: '/accounts/2fa/',
  webLogout: '/accounts/logout/',
} as const;

export type BackendPage = keyof typeof PATHS;

export function backendUrl(page: BackendPage): string {
  return `${config.backendPublicUrl}${PATHS[page]}`;
}
