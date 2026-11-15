import type { MouseEvent } from 'react';
import { anchorId } from './document';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * In-document navigation: scroll the heading into view inside whatever container
 * holds it (page, card or the acceptance screen's scroll area) and move focus there.
 * The URL is not changed, so the router and the browser history are unaffected.
 */
export function goToAnchor(event: MouseEvent, prefix: string, headingId: string) {
  const target = document.getElementById(anchorId(prefix, headingId));
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView?.({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  target.focus({ preventScroll: true });
}
