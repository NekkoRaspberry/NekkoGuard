import { getErrorMessage, isApiError } from '@/api/errors';

export interface FormErrors {
  /** First message per field, keyed by the API field name. */
  fields: Record<string, string>;
  /** Message not tied to a field (or a field the form does not show). */
  form: string | null;
}

/**
 * Splits an API error into per-field messages for the given fields and one form-level
 * message for everything else, so no server message is silently dropped.
 */
export function toFormErrors(error: unknown, shownFields: readonly string[]): FormErrors {
  if (!isApiError(error)) return { fields: {}, form: getErrorMessage(error) };
  const fields: Record<string, string> = {};
  const other: string[] = [];
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    const text = messages.join(' ');
    if (shownFields.includes(field)) fields[field] = text;
    else other.push(text);
  }
  const hasFieldErrors = Object.keys(error.fieldErrors).length > 0;
  const form = other.length > 0 ? other.join(' ') : hasFieldErrors ? null : error.message;
  return { fields, form };
}

export const NO_FORM_ERRORS: FormErrors = { fields: {}, form: null };
