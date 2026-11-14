import { ROUTES } from '@/app/routes';

/** Where the backend sends the browser back to after a provider, keeping `?next=` (e.g. the admin). */
export function providerCallbackUrl(search: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  const next = new URLSearchParams(search).get('next');
  if (next) params.set('next', next);
  for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value);
  const query = params.toString();
  return `${ROUTES.providerCallback}${query ? `?${query}` : ''}`;
}
