import { config } from '@/config/env';
import type { BugReportContext } from '@/api/help';

/**
 * The only details a bug report collects automatically — shown to the user before
 * sending. Never page contents, tokens, cookies or application state. The page is
 * the route path only (no query string or fragment); the server re-sanitizes all of it.
 */
export function collectBrowserContext(pathname: string, nav: Navigator = navigator, win: Window = window): BugReportContext {
  return {
    page: pathname,
    client_version: config.appVersion,
    browser: describeBrowser(nav.userAgent),
    operating_system: describeOs(nav.userAgent),
    viewport: `${win.innerWidth}x${win.innerHeight}`,
  };
}

const BROWSERS: [RegExp, string][] = [
  [/Edg\/([\d.]+)/, 'Edge'],
  [/OPR\/([\d.]+)/, 'Opera'],
  [/Firefox\/([\d.]+)/, 'Firefox'],
  [/Chrome\/([\d.]+)/, 'Chrome'],
  [/Version\/([\d.]+).*Safari\//, 'Safari'],
];

export function describeBrowser(userAgent: string): string {
  for (const [pattern, name] of BROWSERS) {
    const match = pattern.exec(userAgent);
    if (match) {
      const major = match[1]?.split('.')[0];
      return major ? `${name} ${major}` : name;
    }
  }
  return 'Unknown browser';
}

export function describeOs(userAgent: string): string {
  if (/Windows NT/.test(userAgent)) return 'Windows';
  if (/Android/.test(userAgent)) return 'Android';
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'iOS';
  if (/Mac OS X/.test(userAgent)) return 'macOS';
  if (/CrOS/.test(userAgent)) return 'ChromeOS';
  if (/Linux/.test(userAgent)) return 'Linux';
  return 'Unknown OS';
}
