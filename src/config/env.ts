/**
 * Centralised runtime configuration.
 * All values default to "same origin", which is how the app is deployed:
 * nginx (prod) or Vite (dev) proxies /api, /_allauth, /accounts, /users, /static and /ws to Django.
 */

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function deriveWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/`;
}

export const config = {
  apiBaseUrl: trimTrailingSlash(import.meta.env.VITE_API_BASE_URL ?? ''),
  wsUrl: import.meta.env.VITE_WS_URL || deriveWebSocketUrl(),
  requestTimeoutMs: 10_000,
} as const;
