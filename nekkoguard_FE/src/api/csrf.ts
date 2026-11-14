/**
 * Django's CSRF cookie. Local/dev uses "csrftoken"; production uses the
 * "__Secure-" prefixed name (config/settings/production.py). The backend sets it on
 * every /_allauth/browser/* response, so it is available after the first session check.
 */
const CSRF_COOKIE_NAMES = ['__Secure-csrftoken', 'csrftoken'];

export function getCsrfToken(): string | null {
  const cookies = document.cookie ? document.cookie.split('; ') : [];
  for (const name of CSRF_COOKIE_NAMES) {
    const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
    if (match) return decodeURIComponent(match.slice(name.length + 1));
  }
  return null;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isUnsafeMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}
