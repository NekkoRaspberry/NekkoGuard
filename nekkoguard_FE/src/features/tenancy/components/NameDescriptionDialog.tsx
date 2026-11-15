import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Modal } from '@/components/Modal/Modal';
import formStyles from '@/components/Modal/ModalForm.module.css';
import { TextField } from '@/components/TextField/TextField';
import { NO_FORM_ERRORS, toFormErrors, type FormErrors } from '@/lib/apiForm';

export interface NameDescription {
  name: string;
  description: string;
}

interface NameDescriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  initial?: NameDescription;
  submitLabel: string;
  /** Extra fields (rendered under the description). */
  children?: ReactNode;
  onSubmit: (values: NameDescription) => Promise<unknown>;
  onSaved?: () => void;
}

const NAME_MAX = 120;
const DESCRIPTION_MAX = 500;

/** Create/edit dialog for anything with a name and description (sites, organizations, tenants). */
export function NameDescriptionDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  initial,
  submitLabel,
  children,
  onSubmit,
  onSaved,
}: NameDescriptionDialogProps) {
  // Remounted by the caller (key) per opened item, so initial values are fresh.
  const [name, setName] = useState(initial?.name ?? '');
  const [text, setText] = useState(initial?.description ?? '');
  const [errors, setErrors] = useState<FormErrors>(NO_FORM_ERRORS);

  const save = useMutation({
    mutationFn: onSubmit,
    onSuccess: () => {
      onSaved?.();
      onOpenChange(false);
    },
    onError: (error) => setErrors(toFormErrors(error, ['name', 'description'])),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setErrors({ fields: { name: 'Enter a name.' }, form: null });
      return;
    }
    setErrors(NO_FORM_ERRORS);
    save.mutate({ name: name.trim(), description: text.trim() });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={description} icon={icon} size="md">
      <form className={formStyles.form} onSubmit={handleSubmit} noValidate>
        {errors.form && <Banner tone="danger">{errors.form}</Banner>}
        <TextField
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.fields.name ?? null}
          maxLength={NAME_MAX}
          autoFocus
        />
        <TextField
          label="Description"
          value={text}
          onChange={(event) => setText(event.target.value)}
          error={errors.fields.description ?? null}
          maxLength={DESCRIPTION_MAX}
          hint="Optional."
        />
        {children}
        <div className={formStyles.actions}>
          <div className={formStyles.actionsEnd}>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {submitLabel}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
