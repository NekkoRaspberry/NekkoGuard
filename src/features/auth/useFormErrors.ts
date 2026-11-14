import { useCallback, useState } from 'react';
import { getErrorMessage, isApiError } from '@/api/errors';

export type FormErrors<Field extends string> = Partial<Record<Field | 'form', string>>;

/**
 * Field + form-level error state for small forms. Server field errors (keyed by the
 * backend's `param`) land on the matching field; everything else becomes a form error.
 */
export function useFormErrors<Field extends string>(fields: readonly Field[]) {
  const [errors, setErrors] = useState<FormErrors<Field>>({});

  const fromError = useCallback(
    (error: unknown, fallback?: string) => {
      const next: FormErrors<Field> = {};
      if (isApiError(error)) {
        let placed = false;
        for (const field of fields) {
          const messages = error.fieldErrors[field];
          if (messages?.length) {
            next[field] = messages.join(' ');
            placed = true;
          }
        }
        if (!placed) next.form = error.message || fallback || 'Something went wrong.';
      } else {
        next.form = getErrorMessage(error, fallback);
      }
      setErrors(next);
    },
    [fields],
  );

  const clearField = useCallback((field: Field) => {
    setErrors((current) => (current[field] || current.form ? { ...current, [field]: undefined, form: undefined } : current));
  }, []);

  return { errors, setErrors, fromError, clearField };
}
