import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Extension } from '@tiptap/react';

/**
 * Gives every heading a stable, unique `id` attribute: the target of the table of
 * contents and of "#section" links. An id is generated once (from the heading text)
 * and kept when the text changes, so existing links keep working; duplicates (e.g. a
 * heading split in two) get a fresh id. The backend applies the same rules on save.
 */

const ANCHOR = /^[a-z0-9][a-z0-9-]{0,79}$/;
const PLACEHOLDER = /^section(-\d+)?$/;

export function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'section';
}

function unique(base: string, taken: Set<string>): string {
  let candidate = base;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${base.slice(0, 74)}-${n}`;
  return candidate;
}

export const HeadingIds = Extension.create({
  name: 'headingIds',

  addGlobalAttributes() {
    return [
      {
        types: ['heading'],
        attributes: {
          id: {
            default: null,
            // Rendered as data-* in the editor so it never clashes with the reader's DOM ids.
            parseHTML: (element: HTMLElement) => element.getAttribute('data-heading-id'),
            renderHTML: (attributes: { id?: string | null }) => (attributes.id ? { 'data-heading-id': attributes.id } : {}),
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('headingIds'),
        appendTransaction: (transactions, _oldState, state) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const headings: { pos: number; id: unknown; text: string; attrs: Record<string, unknown> }[] = [];
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'heading') {
              headings.push({ pos, id: node.attrs.id, text: node.textContent, attrs: node.attrs });
              return false;
            }
            return true;
          });
          const taken = new Set<string>();
          const { tr } = state;
          let changed = false;
          for (const heading of headings) {
            const current = typeof heading.id === 'string' ? heading.id : '';
            const keep =
              ANCHOR.test(current) && !taken.has(current) && !(PLACEHOLDER.test(current) && heading.text.trim() !== '');
            const id = keep ? current : unique(slugifyHeading(heading.text), taken);
            taken.add(id);
            if (id !== current) {
              tr.setNodeMarkup(heading.pos, undefined, { ...heading.attrs, id });
              changed = true;
            }
          }
          return changed ? tr.setMeta('addToHistory', false) : null;
        },
      }),
    ];
  },
});
