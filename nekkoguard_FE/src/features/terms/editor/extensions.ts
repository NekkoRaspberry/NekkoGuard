import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import StarterKit from '@tiptap/starter-kit';
import { safeHref } from '../document';
import { HeadingIds } from './headingIds';

/** Only the formatting the backend accepts (support/document.py): no code, images or HTML. */
export function createExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      code: false,
      codeBlock: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        protocols: ['mailto'],
        isAllowedUri: (url) => safeHref(url) !== null,
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null },
      },
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TableKit.configure({ table: { resizable: false } }),
    HeadingIds,
  ];
}
