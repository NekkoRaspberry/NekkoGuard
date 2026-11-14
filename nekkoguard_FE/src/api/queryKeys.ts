export const queryKeys = {
  session: ['auth', 'session'] as const,
  config: ['auth', 'config'] as const,
  currentUser: ['users', 'me'] as const,
  apiHealth: ['system', 'api-health'] as const,
  emails: ['account', 'emails'] as const,
  authenticators: ['account', 'authenticators'] as const,
  providerAccounts: ['account', 'providers'] as const,
  authorizedApps: ['oauth', 'authorized'] as const,
  oauthApplications: ['oauth', 'applications'] as const,
  oidcEnabled: ['oauth', 'oidc'] as const,
};
