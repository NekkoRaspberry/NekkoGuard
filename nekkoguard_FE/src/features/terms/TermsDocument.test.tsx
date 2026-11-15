// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TermsReader } from './components/TermsDocument';
import { buildOutline, normalizeUrl, safeHref } from './document';
import { SAMPLE_DOC } from './fixtures';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('document helpers', () => {
  it('numbers sections by heading level', () => {
    expect(buildOutline(SAMPLE_DOC).map((e) => [e.number, e.id])).toEqual([
      ['1', 'introduction'],
      ['1.1', 'scope'],
      ['2', 'definitions'],
    ]);
  });

  it('accepts only safe links', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com');
    expect(safeHref('mailto:legal@example.com')).toBe('mailto:legal@example.com');
    expect(safeHref('#scope')).toBe('#scope');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
    expect(safeHref('#Not Valid')).toBeNull();
    expect(normalizeUrl('example.com/privacy')).toBe('https://example.com/privacy');
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('TermsReader', () => {
  function renderReader() {
    render(<TermsReader title="Acme Terms" doc={SAMPLE_DOC} prefix="t-" />);
    return screen.getByRole('article', { name: 'Acme Terms' });
  }

  it('renders numbered headings with prefixed, stable anchors', () => {
    const article = renderReader();
    const heading = within(article).getByRole('heading', { name: /Scope/ });
    expect(heading.id).toBe('t-scope');
    expect(heading.textContent).toBe('1.1.Scope');
    expect(within(article).getByRole('heading', { name: /Definitions/ }).id).toBe('t-definitions');
  });

  it('the table of contents scrolls to the right section', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    renderReader();
    const toc = screen.getByRole('navigation', { name: 'Sections' });
    const link = within(toc).getByRole('link', { name: '2.Definitions' });
    expect(link.getAttribute('href')).toBe('#t-definitions');
    fireEvent.click(link);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(document.getElementById('t-definitions'));
    expect(document.activeElement).toBe(document.getElementById('t-definitions'));
  });

  it('in-text section links work, external links open safely, unsafe links are plain text', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const article = renderReader();
    fireEvent.click(within(article).getByRole('link', { name: 'Definitions' }));
    expect(scroll.mock.contexts[0]).toBe(document.getElementById('t-definitions'));
    const external = within(article).getByRole('link', { name: 'website' });
    expect(external.getAttribute('target')).toBe('_blank');
    expect(external.getAttribute('rel')).toBe('noopener noreferrer nofollow');
    expect(within(article).queryByRole('link', { name: 'this' })).toBeNull();
    // The text stays, as plain text, and no javascript: URL reaches the DOM.
    expect(external.closest('p')?.textContent).toContain(' or this.');
    expect(article.innerHTML).not.toContain('javascript:');
  });

  it('renders numbered lists and tables', () => {
    const article = renderReader();
    const list = article.querySelector('ol');
    expect(list?.getAttribute('start')).toBe('1');
    expect(within(list as HTMLElement).getAllByRole('listitem')).toHaveLength(2);
    expect(within(article).getByRole('columnheader', { name: 'Term' })).toBeTruthy();
    expect(within(article).getByRole('cell', { name: 'Tenant' })).toBeTruthy();
  });
});
