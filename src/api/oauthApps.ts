import { apiRequest } from './client';
import { httpRequest } from './http';

/**
 * Connected applications — NekkoGuard as an OAuth2 / OpenID Connect provider.
 * Backend: nekkoguard/users/oauth/ (django-oauth-toolkit). Session-authenticated JSON API.
 */

/** An application the signed-in user approved. */
export interface AuthorizedAppDto {
  id: number;
  name: string;
  scopes: string[];
  authorized_at: string;
  last_used: string;
}

/** A registered application (staff view). */
export interface OAuthApplicationDto {
  id: number;
  name: string;
  client_id: string;
  client_type: 'confidential' | 'public';
  redirect_uris: string[];
  created: string;
  /** Only in the response to the create call, and only for confidential apps. */
  client_secret?: string | null;
}

export interface OAuthApplicationCreateDto {
  name: string;
  client_type: 'confidential' | 'public';
  redirect_uris: string[];
}

export const OAUTH_PATHS = {
  authorize: '/o/authorize/',
  token: '/o/token/',
  revoke: '/o/revoke_token/',
  profile: '/api/oauth/profile/',
  oidcDiscovery: '/o/.well-known/openid-configuration',
} as const;

export const oauthApps = {
  listAuthorized: () => apiRequest<AuthorizedAppDto[]>('/api/oauth/authorized-apps/'),
  revokeAuthorized: (id: number) => apiRequest<null>(`/api/oauth/authorized-apps/${id}/`, { method: 'DELETE' }),

  listApplications: () => apiRequest<OAuthApplicationDto[]>('/api/oauth/applications/'),
  createApplication: (payload: OAuthApplicationCreateDto) =>
    apiRequest<OAuthApplicationDto>('/api/oauth/applications/', { method: 'POST', body: payload }),
  deleteApplication: (id: number) => apiRequest<null>(`/api/oauth/applications/${id}/`, { method: 'DELETE' }),

  /** OpenID Connect is optional on the backend (needs a signing key); true when enabled. */
  oidcEnabled: async () => (await httpRequest(OAUTH_PATHS.oidcDiscovery)).status === 200,
};
