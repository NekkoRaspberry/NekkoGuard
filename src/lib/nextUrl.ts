/**
 * `?next=` support for pages outside the React app — e.g. the Django admin sends users
 * to /login?next=http://<host>:8000/admin/ and expects them back after password + 2FA.
 *
 * Only http(s) URLs on the SAME host name are accepted (the port may differ: in dev the
 * admin runs on Django's port). Anything else is ignored, so this is not an open redirect.
 */
export function readNextUrl(search: string): string | null {
  const raw = new URLSearchParams(search).get('next');
  if (!raw) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.hostname !== window.location.hostname) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** True when `next` points at the Django admin (used for a hint on the login page). */
export function isAdminUrl(url: string): boolean {
  try {
    return new URL(url).pathname.startsWith('/admin');
  } catch {
    return false;
  }
}
