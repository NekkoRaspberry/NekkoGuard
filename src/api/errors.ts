export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'parse';

/** Field-level validation errors as returned by DRF: `{ "field": ["message", ...] }`. */
export type FieldErrors = Record<string, string[]>;

interface ApiErrorInit {
  kind: ApiErrorKind;
  message: string;
  status?: number;
  fieldErrors?: FieldErrors;
}

/** Normalised error thrown by the API client for every failed request. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly fieldErrors: FieldErrors;

  constructor({ kind, message, status, fieldErrors }: ApiErrorInit) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status ?? null;
    this.fieldErrors = fieldErrors ?? {};
  }

  /** True when the server could not be reached at all (or the proxy could not reach Django). */
  get isUnreachable(): boolean {
    return (
      this.kind === 'network' ||
      this.kind === 'timeout' ||
      this.status === 502 ||
      this.status === 503 ||
      this.status === 504
    );
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Human-readable message for any thrown value. */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (isApiError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * DRF error bodies come in three shapes:
 *  - `{ "detail": "..." }`
 *  - `{ "non_field_errors": ["..."] }`
 *  - `{ "field": ["..."] }`
 */
export function parseDrfErrorBody(body: unknown): { message: string | null; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  let message: string | null = null;

  if (typeof body !== 'object' || body === null) {
    return { message, fieldErrors };
  }

  for (const [key, value] of Object.entries(body)) {
    if (key === 'detail' && typeof value === 'string') {
      message = value;
    } else if (key === 'non_field_errors' && isStringArray(value)) {
      message = value.join(' ');
    } else if (isStringArray(value)) {
      fieldErrors[key] = value;
    } else if (typeof value === 'string') {
      fieldErrors[key] = [value];
    }
  }

  return { message, fieldErrors };
}

export function defaultMessageForStatus(status: number): string {
  if (status === 400) return 'The request was not accepted. Please check the form.';
  if (status === 401 || status === 403) return 'You are not allowed to perform this action.';
  if (status === 404) return 'The requested resource was not found.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status >= 500 && status !== 502 && status !== 503 && status !== 504) {
    return 'The NekkoGuard server encountered an error.';
  }
  if (status >= 502) return 'Cannot reach the NekkoGuard server.';
  return `Request failed (HTTP ${status}).`;
}
