import { Link2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Modal } from '@/components/Modal/Modal';
import formStyles from '@/components/Modal/ModalForm.module.css';
import { SelectField } from '@/components/SelectField/SelectField';
import { TextField } from '@/components/TextField/TextField';
import { normalizeUrl, safeHref, type OutlineEntry } from '../document';

type Kind = 'url' | 'section';

export function LinkDialog({
  initialHref,
  hasSelection,
  sections,
  onSave,
  onRemove,
  onClose,
}: {
  initialHref: string;
  /** False: nothing selected, so the link text is asked for. */
  hasSelection: boolean;
  sections: OutlineEntry[];
  onSave: (href: string, text: string | null) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const initialSection = initialHref.startsWith('#') ? initialHref.slice(1) : '';
  const [kind, setKind] = useState<Kind>(initialSection ? 'section' : 'url');
  const [url, setUrl] = useState(initialSection ? '' : initialHref);
  const [section, setSection] = useState(initialSection || sections[0]?.id || '');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const href = kind === 'section' ? (section ? safeHref(`#${section}`) : null) : normalizeUrl(url);
    if (!href) {
      setError(kind === 'section' ? 'Choose a section.' : 'Enter a web address (https://…) or an email (mailto:…).');
      return;
    }
    if (!hasSelection && !text.trim()) {
      setError('Enter the text to show for the link.');
      return;
    }
    onSave(href, hasSelection ? null : text.trim());
    onClose();
  }

  return (
    <Modal open onOpenChange={(open) => !open && onClose()} size="sm" icon={<Link2 size={18} />} title={initialHref ? 'Edit link' : 'Insert link'}>
      <form className={formStyles.form} onSubmit={handleSubmit} noValidate>
        {error && <Banner tone="danger">{error}</Banner>}
        <SelectField<Kind>
          label="Link to"
          value={kind}
          options={[
            { value: 'url', label: 'A web address or email' },
            { value: 'section', label: 'A section of this document' },
          ]}
          onChange={setKind}
        />
        {kind === 'url' ? (
          <TextField
            label="Address"
            value={url}
            placeholder="https://example.com/privacy"
            autoFocus
            onChange={(event) => setUrl(event.target.value)}
            hint="https://, http:// or mailto: only."
          />
        ) : sections.length === 0 ? (
          <p>Add headings to the document to link to its sections.</p>
        ) : (
          <SelectField
            label="Section"
            value={section}
            options={sections.map((entry) => ({ value: entry.id, label: `${entry.number}. ${entry.text}` }))}
            onChange={setSection}
          />
        )}
        {!hasSelection && <TextField label="Text to show" value={text} onChange={(event) => setText(event.target.value)} />}
        <div className={formStyles.actions}>
          {initialHref && (
            <Button
              variant="ghost"
              onClick={() => {
                onRemove();
                onClose();
              }}
            >
              Remove link
            </Button>
          )}
          <div className={formStyles.actionsEnd}>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save link
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
