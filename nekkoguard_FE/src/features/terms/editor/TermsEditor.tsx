import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Columns3,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Rows3,
  Strikethrough,
  Table2,
  Trash2,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { TermsDocumentJson } from '@/api/terms';
import { cx } from '@/lib/cx';
import { buildOutline } from '../document';
import { createExtensions } from './extensions';
import { LinkDialog } from './LinkDialog';
import styles from './TermsEditor.module.css';

/**
 * Rich-text editor for Terms of Service (Tiptap / ProseMirror). Produces the same
 * JSON the backend validates and the reader renders. Only the formatting the
 * backend accepts is enabled (no code, images or raw HTML).
 */

type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3';

function ToolButton({
  label,
  shortcut,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  shortcut?: string;
  icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      className={cx(styles.tool, active && styles.toolActive)}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      title={title}
      disabled={disabled}
      // Keep the selection in the editor while clicking the toolbar.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.group} role="group" aria-label={label}>
      {children}
    </div>
  );
}

function Toolbar({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: (e.isActive('heading', { level: 1 })
        ? 'h1'
        : e.isActive('heading', { level: 2 })
          ? 'h2'
          : e.isActive('heading', { level: 3 })
            ? 'h3'
            : 'paragraph') as BlockType,
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      link: e.isActive('link'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      inList: e.isActive('listItem'),
      inTable: e.isActive('table'),
      align: (['center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left',
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      canSink: e.can().sinkListItem('listItem'),
      canLift: e.can().liftListItem('listItem'),
    }),
  });
  const chain = () => editor.chain().focus();

  function setBlock(value: BlockType) {
    if (value === 'paragraph') chain().setParagraph().run();
    else chain().setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run();
  }

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
      <Group label="History">
        <ToolButton label="Undo" shortcut="Ctrl+Z" icon={Undo2} disabled={!state.canUndo} onClick={() => chain().undo().run()} />
        <ToolButton label="Redo" shortcut="Ctrl+Shift+Z" icon={Redo2} disabled={!state.canRedo} onClick={() => chain().redo().run()} />
      </Group>
      <Group label="Text style">
        <select
          className={styles.blockSelect}
          aria-label="Text style"
          value={state.block}
          onChange={(event) => setBlock(event.target.value as BlockType)}
        >
          <option value="paragraph">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
      </Group>
      <Group label="Formatting">
        <ToolButton label="Bold" shortcut="Ctrl+B" icon={Bold} active={state.bold} onClick={() => chain().toggleBold().run()} />
        <ToolButton label="Italic" shortcut="Ctrl+I" icon={Italic} active={state.italic} onClick={() => chain().toggleItalic().run()} />
        <ToolButton label="Underline" shortcut="Ctrl+U" icon={Underline} active={state.underline} onClick={() => chain().toggleUnderline().run()} />
        <ToolButton label="Strikethrough" shortcut="Ctrl+Shift+S" icon={Strikethrough} active={state.strike} onClick={() => chain().toggleStrike().run()} />
        <ToolButton label="Link" shortcut="Ctrl+K" icon={Link2} active={state.link} onClick={onLink} />
      </Group>
      <Group label="Alignment">
        <ToolButton label="Align left" icon={AlignLeft} active={state.align === 'left'} onClick={() => chain().setTextAlign('left').run()} />
        <ToolButton label="Align center" icon={AlignCenter} active={state.align === 'center'} onClick={() => chain().setTextAlign('center').run()} />
        <ToolButton label="Align right" icon={AlignRight} active={state.align === 'right'} onClick={() => chain().setTextAlign('right').run()} />
        <ToolButton label="Justify" icon={AlignJustify} active={state.align === 'justify'} onClick={() => chain().setTextAlign('justify').run()} />
      </Group>
      <Group label="Lists">
        <ToolButton label="Bulleted list" icon={List} active={state.bullet} onClick={() => chain().toggleBulletList().run()} />
        <ToolButton label="Numbered list" icon={ListOrdered} active={state.ordered} onClick={() => chain().toggleOrderedList().run()} />
        <ToolButton label="Indent list item" shortcut="Tab" icon={IndentIncrease} disabled={!state.canSink} onClick={() => chain().sinkListItem('listItem').run()} />
        <ToolButton label="Outdent list item" shortcut="Shift+Tab" icon={IndentDecrease} disabled={!state.canLift} onClick={() => chain().liftListItem('listItem').run()} />
      </Group>
      <Group label="Blocks">
        <ToolButton label="Quote" icon={Quote} active={state.quote} onClick={() => chain().toggleBlockquote().run()} />
        <ToolButton label="Divider" icon={Minus} onClick={() => chain().setHorizontalRule().run()} />
        <ToolButton
          label="Insert table"
          icon={Table2}
          disabled={state.inTable}
          onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        />
      </Group>
      {state.inTable && (
        <Group label="Table">
          <ToolButton label="Add row below" icon={Rows3} onClick={() => chain().addRowAfter().run()} />
          <button type="button" className={styles.textTool} onMouseDown={(e) => e.preventDefault()} onClick={() => chain().deleteRow().run()}>
            Delete row
          </button>
          <ToolButton label="Add column right" icon={Columns3} onClick={() => chain().addColumnAfter().run()} />
          <button type="button" className={styles.textTool} onMouseDown={(e) => e.preventDefault()} onClick={() => chain().deleteColumn().run()}>
            Delete column
          </button>
          <ToolButton label="Delete table" icon={Trash2} onClick={() => chain().deleteTable().run()} />
        </Group>
      )}
    </div>
  );
}

export function TermsEditor({
  value,
  onChange,
  label = 'Terms of Service text',
}: {
  value: TermsDocumentJson;
  onChange: (doc: TermsDocumentJson) => void;
  label?: string;
}) {
  const [linking, setLinking] = useState(false);
  const editor = useEditor({
    extensions: createExtensions(),
    // No <style> tag injected at runtime (the CSP forbids inline styles): Tiptap's few
    // base rules live in TermsEditor.module.css.
    injectCSS: false,
    content: value,
    editorProps: {
      attributes: { class: styles.content ?? '', 'aria-label': label, 'aria-multiline': 'true', role: 'textbox' },
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          setLinking(true);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as TermsDocumentJson),
  });

  if (!editor) return null;

  return (
    <div className={styles.editor}>
      <Toolbar editor={editor} onLink={() => setLinking(true)} />
      <EditorContent editor={editor} className={styles.surface} />
      {linking && (
        <LinkDialog
          initialHref={(editor.getAttributes('link').href as string | undefined) ?? ''}
          hasSelection={!editor.state.selection.empty || editor.isActive('link')}
          sections={buildOutline(editor.getJSON() as TermsDocumentJson)}
          onClose={() => {
            setLinking(false);
            editor.commands.focus();
          }}
          onRemove={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
          onSave={(href, text) => {
            if (text) {
              editor
                .chain()
                .focus()
                .insertContent({ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] })
                .run();
            } else {
              editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
            }
          }}
        />
      )}
    </div>
  );
}
