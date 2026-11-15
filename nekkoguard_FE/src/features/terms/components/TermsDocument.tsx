import { Fragment, type ReactNode } from 'react';
import type { DocMark, DocNode, TermsDocumentJson } from '@/api/terms';
import { cx } from '@/lib/cx';
import { goToAnchor } from '../anchors';
import { anchorId, buildOutline, safeHref, type OutlineEntry } from '../document';
import styles from './TermsDocument.module.css';

/**
 * Renders a Terms of Service document (ProseMirror JSON) as React elements — never as
 * HTML — so nothing from the stored document can run as script. Used by the reader,
 * the draft preview, the history and the mandatory acceptance screen alike.
 */

const ALIGN: Record<string, string | undefined> = {
  center: styles.alignCenter,
  right: styles.alignRight,
  justify: styles.alignJustify,
};

function renderMarks(text: ReactNode, marks: DocMark[] | undefined, prefix: string): ReactNode {
  return (marks ?? []).reduce<ReactNode>((inner, mark) => {
    switch (mark.type) {
      case 'bold':
        return <strong>{inner}</strong>;
      case 'italic':
        return <em>{inner}</em>;
      case 'underline':
        return <u>{inner}</u>;
      case 'strike':
        return <s>{inner}</s>;
      case 'link': {
        const href = safeHref(mark.attrs?.href);
        if (!href) return inner; // unsafe or invalid: plain text
        if (href.startsWith('#')) {
          const id = href.slice(1);
          return (
            <a href={`#${anchorId(prefix, id)}`} className={styles.link} onClick={(event) => goToAnchor(event, prefix, id)}>
              {inner}
            </a>
          );
        }
        return (
          <a href={href} className={styles.link} target="_blank" rel="noopener noreferrer nofollow">
            {inner}
          </a>
        );
      }
      default:
        return inner;
    }
  }, text);
}

interface RenderContext {
  prefix: string;
  numbers: Map<string, string>;
  numbered: boolean;
}

function renderChildren(node: DocNode, ctx: RenderContext): ReactNode {
  return (node.content ?? []).map((child, index) => <Fragment key={index}>{renderNode(child, ctx)}</Fragment>);
}

function renderNode(node: DocNode, ctx: RenderContext): ReactNode {
  const align = typeof node.attrs?.textAlign === 'string' ? ALIGN[node.attrs.textAlign] : undefined;
  switch (node.type) {
    case 'text':
      return renderMarks(node.text ?? '', node.marks, ctx.prefix);
    case 'paragraph':
      return <p className={cx(styles.paragraph, align)}>{renderChildren(node, ctx)}</p>;
    case 'heading': {
      const level = node.attrs?.level === 2 ? 2 : node.attrs?.level === 3 ? 3 : 1;
      const id = typeof node.attrs?.id === 'string' ? node.attrs.id : '';
      // The page title is the <h1>/<h2>: document sections start one level below.
      const Tag = (['h2', 'h3', 'h4'] as const)[level - 1] ?? 'h2';
      const number = ctx.numbered ? ctx.numbers.get(id) : undefined;
      return (
        <Tag id={id ? anchorId(ctx.prefix, id) : undefined} tabIndex={-1} className={cx(styles.heading, styles[`h${level}`], align)}>
          {number && <span className={styles.number}>{number}.</span>}
          {renderChildren(node, ctx)}
        </Tag>
      );
    }
    case 'bulletList':
      return <ul className={styles.list}>{renderChildren(node, ctx)}</ul>;
    case 'orderedList': {
      const start = typeof node.attrs?.start === 'number' ? node.attrs.start : undefined;
      return (
        <ol className={styles.list} start={start}>
          {renderChildren(node, ctx)}
        </ol>
      );
    }
    case 'listItem':
      return <li>{renderChildren(node, ctx)}</li>;
    case 'blockquote':
      return <blockquote className={styles.quote}>{renderChildren(node, ctx)}</blockquote>;
    case 'horizontalRule':
      return <hr className={styles.rule} />;
    case 'hardBreak':
      return <br />;
    case 'table':
      return (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <tbody>{renderChildren(node, ctx)}</tbody>
          </table>
        </div>
      );
    case 'tableRow':
      return <tr>{renderChildren(node, ctx)}</tr>;
    case 'tableHeader':
    case 'tableCell': {
      const Cell = node.type === 'tableHeader' ? 'th' : 'td';
      const colSpan = typeof node.attrs?.colspan === 'number' && node.attrs.colspan > 1 ? node.attrs.colspan : undefined;
      const rowSpan = typeof node.attrs?.rowspan === 'number' && node.attrs.rowspan > 1 ? node.attrs.rowspan : undefined;
      return (
        <Cell colSpan={colSpan} rowSpan={rowSpan}>
          {renderChildren(node, ctx)}
        </Cell>
      );
    }
    default:
      return null; // unknown nodes are never rendered
  }
}

export function TermsDocument({
  doc,
  prefix = 'terms-',
  numbered = true,
}: {
  doc: TermsDocumentJson;
  /** Prefix of heading DOM ids (keep it unique per document on a page). */
  prefix?: string;
  numbered?: boolean;
}) {
  const numbers = new Map(buildOutline(doc).map((entry) => [entry.id, entry.number]));
  return <div className={styles.document}>{renderChildren(doc, { prefix, numbers, numbered })}</div>;
}

export function TermsOutline({ entries, prefix = 'terms-', label = 'On this page' }: { entries: OutlineEntry[]; prefix?: string; label?: string }) {
  if (entries.length === 0) return null;
  return (
    <nav className={styles.outline} aria-label="Sections">
      <p className={styles.outlineLabel}>{label}</p>
      <ol className={styles.outlineList}>
        {entries.map((entry) => (
          <li key={entry.id} className={styles[`outlineLevel${entry.level}`]}>
            <a href={`#${anchorId(prefix, entry.id)}`} className={styles.outlineLink} onClick={(event) => goToAnchor(event, prefix, entry.id)}>
              <span className={styles.outlineNumber}>{entry.number}.</span>
              {entry.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Title block + table of contents + document: the reading layout used everywhere. */
export function TermsReader({
  title,
  meta,
  doc,
  prefix = 'terms-',
  banner,
}: {
  title: string;
  meta?: ReactNode;
  doc: TermsDocumentJson;
  prefix?: string;
  banner?: ReactNode;
}) {
  const outline = buildOutline(doc);
  return (
    <div className={cx(styles.reader, outline.length === 0 && styles.readerNoOutline)}>
      <TermsOutline entries={outline} prefix={prefix} />
      <article className={styles.article} aria-label={title}>
        <header className={styles.titleBlock}>
          <h2 className={styles.title}>{title}</h2>
          {meta && <div className={styles.meta}>{meta}</div>}
        </header>
        {banner}
        <TermsDocument doc={doc} prefix={prefix} />
      </article>
    </div>
  );
}
