import type { DocNode, TermsDocumentJson } from '@/api/terms';

/**
 * Pure helpers shared by the reader, the preview, the editor and the acceptance
 * screen, so numbering, anchors and links are identical everywhere.
 */

export interface OutlineEntry {
  /** Stable heading id stored in the document (validated by the backend). */
  id: string;
  level: 1 | 2 | 3;
  /** "1", "1.2", "1.2.3" */
  number: string;
  text: string;
}

const ANCHOR = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function plainText(node: DocNode): string {
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(plainText).join('');
}

/** Headings in order with their section numbers (H1 → 1, H2 → 1.1, H3 → 1.1.1). */
export function buildOutline(doc: TermsDocumentJson | null | undefined): OutlineEntry[] {
  const counters = [0, 0, 0];
  const entries: OutlineEntry[] = [];
  for (const node of doc?.content ?? []) {
    if (node.type !== 'heading') continue;
    const level = node.attrs?.level;
    const id = node.attrs?.id;
    if ((level !== 1 && level !== 2 && level !== 3) || typeof id !== 'string') continue;
    counters[level - 1] = (counters[level - 1] ?? 0) + 1;
    for (let i = level; i < counters.length; i += 1) counters[i] = 0;
    // A level-2 heading before any level 1 is numbered under "0" rather than skipped.
    entries.push({ id, level, number: counters.slice(0, level).join('.'), text: plainText(node).trim() || 'Untitled section' });
  }
  return entries;
}

/** Same rules as the backend (support/document.py): anything else is not a link. */
export function safeHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const href = value.trim();
  // eslint-disable-next-line no-control-regex
  if (href.length > 2000 || /[\u0000-\u001f]/.test(href)) return null;
  if (href.startsWith('#')) return ANCHOR.test(href.slice(1)) ? href : null;
  const lower = href.toLowerCase();
  if ((lower.startsWith('https://') || lower.startsWith('http://') || lower.startsWith('mailto:')) && href.length > 'mailto:'.length) {
    return href;
  }
  return null;
}

/** DOM id of a heading: prefixed, so two documents on one page never share ids. */
export const anchorId = (prefix: string, headingId: string) => `${prefix}${headingId}`;

export function isEmptyDocument(doc: TermsDocumentJson | null | undefined): boolean {
  return !doc || plainText(doc).trim() === '';
}

/** "example.com" → "https://example.com"; anything unsafe stays invalid. */
export function normalizeUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('#')) return safeHref(value);
  return safeHref(`https://${value}`);
}
