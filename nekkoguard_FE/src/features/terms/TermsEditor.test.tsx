// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TermsDocumentJson } from '@/api/terms';
import { slugifyHeading } from './editor/headingIds';
import { TermsEditor } from './editor/TermsEditor';
import { stubLayoutApis } from './fixtures';

beforeAll(stubLayoutApis);

afterEach(cleanup);

const DOC: TermsDocumentJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Introduction' }] }],
};

describe('TermsEditor', () => {
  it('offers a labelled formatting toolbar', () => {
    render(<TermsEditor value={DOC} onChange={vi.fn()} />);
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
    for (const name of ['Bold', 'Italic', 'Underline', 'Strikethrough', 'Link', 'Bulleted list', 'Numbered list', 'Quote', 'Insert table', 'Undo']) {
      expect(toolbar.querySelector(`[aria-label="${name}"]`)).not.toBeNull();
    }
    expect(screen.getByRole('textbox', { name: 'Terms of Service text' })).toBeTruthy();
  });

  it('turns a paragraph into a heading with a stable anchor id', async () => {
    const onChange = vi.fn();
    render(<TermsEditor value={DOC} onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Text style' }), { target: { value: 'h1' } });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const doc = onChange.mock.lastCall?.[0] as TermsDocumentJson;
    expect(doc.content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 1, id: 'introduction' } });
  });

  it('creates lists from the toolbar', async () => {
    const onChange = vi.fn();
    render(<TermsEditor value={DOC} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Numbered list' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect((onChange.mock.lastCall?.[0] as TermsDocumentJson).content?.[0]?.type).toBe('orderedList');
  });

  it('slugs heading text into anchor ids', () => {
    expect(slugifyHeading('Limitations of Liability')).toBe('limitations-of-liability');
    expect(slugifyHeading('Proteção de Dados')).toBe('protecao-de-dados');
    expect(slugifyHeading('***')).toBe('section');
  });
});
