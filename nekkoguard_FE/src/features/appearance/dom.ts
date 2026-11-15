import type { ResolvedValues } from '@/api/appearance';
import { ALL_THEME_VARIABLES, DEFAULT_TITLE, themeVariables } from './theme';

/**
 * The only code that writes appearance to the document. With `null` everything is put
 * back exactly as index.html/tokens.css define it.
 */

let originalFavicon: { href: string; type: string } | null = null;

function faviconLink(): HTMLLinkElement | null {
  return document.head.querySelector<HTMLLinkElement>('link[rel~="icon"]');
}

export function applyFavicon(url: string | null): void {
  const link = faviconLink();
  if (!link) return;
  if (originalFavicon === null) {
    originalFavicon = { href: link.getAttribute('href') ?? '', type: link.getAttribute('type') ?? '' };
  }
  const target = url ? { href: url, type: 'image/png' } : originalFavicon;
  if (link.getAttribute('href') !== target.href) link.setAttribute('href', target.href);
  if (target.type) link.setAttribute('type', target.type);
  else link.removeAttribute('type');
}

export function applyAppearance(effective: ResolvedValues | null, root: HTMLElement = document.documentElement): void {
  for (const name of ALL_THEME_VARIABLES) root.style.removeProperty(name);
  if (effective) {
    for (const [name, value] of Object.entries(themeVariables(effective))) root.style.setProperty(name, value);
  }
  document.title = effective?.title ?? DEFAULT_TITLE;
  applyFavicon(effective?.favicon_url ?? null);
}
