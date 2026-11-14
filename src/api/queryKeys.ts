export const queryKeys = {
  session: ['auth', 'session'] as const,
  config: ['auth', 'config'] as const,
  currentUser: ['users', 'me'] as const,
  apiHealth: ['system', 'api-health'] as const,
  emails: ['account', 'emails'] as const,
  authenticators: ['account', 'authenticators'] as const,
};
