import { ApiError, defaultMessageForStatus, parseDrfErrorBody } from './errors';
import { httpRequest, type HttpRequest } from './http';

/**
 * DRF messages meaning "no valid session". With SessionAuthentication first in the
 * backend's chain, DRF answers these with 403, so the message is what tells an expired
 * session apart from a real permission error.
 */
const AUTH_FAILURE_MESSAGES = new Set([
  'Authentication credentials were not provided.',
  'Invalid token.',
  'User inactive or deleted.',
]);

type SessionLostHandler = () => void;
let sessionLostHandler: SessionLostHandler | null = null;

/** Backend code of a 403 meaning "accept the Terms of Service first" (support/middleware.py). */
export const TERMS_REQUIRED_CODE = 'terms_acceptance_required';
let termsRequiredHandler: (() => void) | null = null;

/** Registered by the TermsGate: any blocked request brings the acceptance screen back. */
export function setTermsRequiredHandler(handler: (() => void) | null): void {
  termsRequiredHandler = handler;
}

/** Registered by the AuthProvider: a lost session anywhere re-checks the auth state. */
export function setSessionLostHandler(handler: SessionLostHandler | null): void {
  sessionLostHandler = handler;
}

export function notifySessionLost(): void {
  sessionLostHandler?.();
}

/** REST calls to the DRF API (`/api/...`). Throws `ApiError` for any non-2xx response. */
export async function apiRequest<T>(path: string, options: HttpRequest = {}): Promise<T> {
  const { status, data } = await httpRequest(path, options);

  if (status >= 200 && status < 300) return data as T;

  if (status === 403 && (data as { code?: unknown } | null)?.code === TERMS_REQUIRED_CODE) {
    termsRequiredHandler?.();
    throw new ApiError({ kind: 'http', status, message: 'Accept the Terms of Service to continue.' });
  }

  const { message, fieldErrors } = parseDrfErrorBody(data);
  const isAuthFailure = status === 401 || (status === 403 && message !== null && AUTH_FAILURE_MESSAGES.has(message));
  if (isAuthFailure) notifySessionLost();

  throw new ApiError({
    kind: 'http',
    status,
    message: message ?? defaultMessageForStatus(status),
    fieldErrors,
  });
}
