import type { TermsDocumentJson, TermsVersionDto } from '@/api/terms';
import { TENANT_ID } from '@/features/appearance/testing';

/** A document using every supported node (tests only). */
export const SAMPLE_DOC: TermsDocumentJson = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1, id: 'introduction' }, content: [{ type: 'text', text: 'Introduction' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'See ' },
        { type: 'text', text: 'Definitions', marks: [{ type: 'link', attrs: { href: '#definitions' } }] },
        { type: 'text', text: ' and our ' },
        { type: 'text', text: 'website', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
        { type: 'text', text: ' or ' },
        { type: 'text', text: 'this', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
        { type: 'text', text: '.' },
      ],
    },
    { type: 'heading', attrs: { level: 2, id: 'scope' }, content: [{ type: 'text', text: 'Scope', marks: [{ type: 'bold' }] }] },
    {
      type: 'orderedList',
      attrs: { start: 1 },
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }] },
      ],
    },
    { type: 'heading', attrs: { level: 1, id: 'definitions' }, content: [{ type: 'text', text: 'Definitions' }] },
    {
      type: 'table',
      content: [
        { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Term' }] }] }] },
        { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tenant' }] }] }] },
      ],
    },
  ],
};

export function versionDto(overrides: Partial<TermsVersionDto> = {}): TermsVersionDto {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    number: 2,
    title: 'Acme Terms',
    status: 'current',
    content_hash: 'a'.repeat(64),
    created_at: '2026-11-01T00:00:00Z',
    created_by: null,
    updated_at: '2026-11-01T00:00:00Z',
    published_at: '2026-11-10T09:00:00Z',
    published_by: { id: 1, email: 'admin@example.test', name: 'Ana' },
    effective_date: '2026-11-10',
    superseded_at: null,
    accepted_count: 3,
    tenant: { id: TENANT_ID, name: 'Acme' },
    content: SAMPLE_DOC,
    ...overrides,
  };
}

/** jsdom has no layout: ProseMirror measures selections when scrolling them into view. */
export function stubLayoutApis(): void {
  const rect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) }) as DOMRect;
  const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = rect;
  Range.prototype.getClientRects = rects;
  if (!('getClientRects' in Text.prototype)) {
    Object.defineProperty(Text.prototype, 'getClientRects', { value: rects, configurable: true });
  }
  document.elementFromPoint ??= () => null;
}
