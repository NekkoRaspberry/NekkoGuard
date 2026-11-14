import { notifySessionLost } from './client';
import { ApiError, defaultMessageForStatus, type FieldErrors } from './errors';
import { httpRequest, type HttpMethod } from './http';
import type {
  AllauthEnvelope,
  AuthenticatorDto,
  ConfigDto,
  EmailAddressDto,
  EmailVerificationInfoDto,
  Flow,
  RecoveryCodesAuthenticatorDto,
  SessionEnvelope,
  TotpAuthenticatorDto,
  TotpSetupMeta,
} from './types';

/** django-allauth headless, "browser" client (session cookie + CSRF). */
const BASE = '/_allauth/browser/v1';

/** Thrown when a sensitive action needs the user to confirm their identity again. */
export class ReauthenticationRequiredError extends ApiError {
  readonly flows: Flow[];

  constructor(flows: Flow[]) {
    super({ kind: 'http', status: 401, message: 'Please confirm your identity to continue.' });
    this.name = 'ReauthenticationRequiredError';
    this.flows = flows;
  }
}

function toApiError(envelope: AllauthEnvelope<unknown, object> | null, status: number): ApiError {
  const fieldErrors: FieldErrors = {};
  const general: string[] = [];
  for (const error of envelope?.errors ?? []) {
    if (error.param) (fieldErrors[error.param] ??= []).push(error.message);
    else general.push(error.message);
  }
  const firstFieldMessage = Object.values(fieldErrors)[0]?.[0];
  return new ApiError({
    kind: 'http',
    status,
    message: general.join(' ') || firstFieldMessage || defaultMessageForStatus(status),
    fieldErrors,
  });
}

interface CallOptions {
  /** Statuses returned to the caller instead of thrown (beyond 2xx). */
  accept?: number[];
  headers?: Record<string, string>;
}

async function call<T extends AllauthEnvelope<unknown, object>>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  { accept = [], headers }: CallOptions = {},
): Promise<T> {
  const { status, data } = await httpRequest(`${BASE}${path}`, {
    method,
    ...(body === undefined ? {} : { body }),
    ...(headers ? { headers } : {}),
  });
  const envelope = (data ?? null) as T | null;

  if ((status >= 200 && status < 300) || accept.includes(status)) {
    return (envelope ?? { status }) as T;
  }
  throw toApiError(envelope, status);
}

/**
 * Account endpoints (signed in): 401 means either "re-authenticate first" (still signed in)
 * or "session is gone" (signed out).
 */
async function accountCall<T extends AllauthEnvelope<unknown, object>>(method: HttpMethod, path: string, body?: unknown, options?: CallOptions) {
  const accept = [401, ...(options?.accept ?? [])];
  const envelope = await call<T>(method, path, body, { accept });
  if (envelope.status === 401) {
    const reauth = envelope as unknown as SessionEnvelope;
    if (reauth.meta?.is_authenticated) throw new ReauthenticationRequiredError(reauth.data?.flows ?? []);
    notifySessionLost();
    throw new ApiError({ kind: 'http', status: 401, message: 'Your session has ended. Please sign in again.' });
  }
  return envelope;
}

// ---------------------------------------------------------------- authentication
// Auth endpoints answer 200 (authenticated) or 401 (next flow) — both are session states.

const AUTH_STATES = { accept: [401] };

export const allauth = {
  getConfig: () => call<AllauthEnvelope<ConfigDto>>('GET', '/config'),

  getSession: () => call<SessionEnvelope>('GET', '/auth/session', undefined, { accept: [401, 410] }),

  logout: () => call<SessionEnvelope>('DELETE', '/auth/session', undefined, AUTH_STATES),

  login: (email: string, password: string) => call<SessionEnvelope>('POST', '/auth/login', { email, password }, AUTH_STATES),

  signup: (email: string, password: string) => call<SessionEnvelope>('POST', '/auth/signup', { email, password }, AUTH_STATES),

  mfaAuthenticate: (code: string) => call<SessionEnvelope>('POST', '/auth/2fa/authenticate', { code }, AUTH_STATES),

  reauthenticate: (password: string) => call<SessionEnvelope>('POST', '/auth/reauthenticate', { password }, AUTH_STATES),

  mfaReauthenticate: (code: string) => call<SessionEnvelope>('POST', '/auth/2fa/reauthenticate', { code }, AUTH_STATES),

  // The GET variants take the key in a header (spec: X-Email-Verification-Key / X-Password-Reset-Key).
  getEmailVerification: (key: string) =>
    call<AllauthEnvelope<EmailVerificationInfoDto, { is_authenticating: boolean }>>('GET', '/auth/email/verify', undefined, {
      headers: { 'X-Email-Verification-Key': key },
    }),

  verifyEmail: (key: string) => call<SessionEnvelope>('POST', '/auth/email/verify', { key }, AUTH_STATES),

  requestPasswordReset: (email: string) => call<AllauthEnvelope>('POST', '/auth/password/request', { email }),

  getPasswordReset: (key: string) =>
    call<AllauthEnvelope<{ user: { display: string } }>>('GET', '/auth/password/reset', undefined, {
      headers: { 'X-Password-Reset-Key': key },
    }),

  resetPassword: (key: string, password: string) =>
    call<SessionEnvelope>('POST', '/auth/password/reset', { key, password }, AUTH_STATES),

  // ---------------------------------------------------------------- account (signed in)

  changePassword: (currentPassword: string, newPassword: string) =>
    accountCall<AllauthEnvelope>('POST', '/account/password/change', {
      current_password: currentPassword,
      new_password: newPassword,
    }),

  listEmails: () => accountCall<AllauthEnvelope<EmailAddressDto[]>>('GET', '/account/email'),
  addEmail: (email: string) => accountCall<AllauthEnvelope<EmailAddressDto[]>>('POST', '/account/email', { email }),
  resendEmailVerification: (email: string) => accountCall<AllauthEnvelope>('PUT', '/account/email', { email }),
  makePrimaryEmail: (email: string) =>
    accountCall<AllauthEnvelope<EmailAddressDto[]>>('PATCH', '/account/email', { email, primary: true }),
  removeEmail: (email: string) => accountCall<AllauthEnvelope<EmailAddressDto[]>>('DELETE', '/account/email', { email }),

  listAuthenticators: () => accountCall<AllauthEnvelope<AuthenticatorDto[]>>('GET', '/account/authenticators'),

  /** 200 = TOTP active; 404 = not active, `meta` carries a fresh secret for setup. */
  getTotp: () =>
    accountCall<AllauthEnvelope<TotpAuthenticatorDto, Partial<TotpSetupMeta>>>('GET', '/account/authenticators/totp', undefined, {
      accept: [404],
    }),
  activateTotp: (code: string) =>
    accountCall<AllauthEnvelope<TotpAuthenticatorDto>>('POST', '/account/authenticators/totp', { code }),
  deactivateTotp: () => accountCall<AllauthEnvelope>('DELETE', '/account/authenticators/totp'),

  /** 404 = no recovery codes exist (2FA not enabled). */
  getRecoveryCodes: () =>
    accountCall<AllauthEnvelope<RecoveryCodesAuthenticatorDto>>('GET', '/account/authenticators/recovery-codes', undefined, {
      accept: [404],
    }),
  regenerateRecoveryCodes: () =>
    accountCall<AllauthEnvelope<RecoveryCodesAuthenticatorDto>>('POST', '/account/authenticators/recovery-codes'),
};

export function isReauthenticationRequired(error: unknown): error is ReauthenticationRequiredError {
  return error instanceof ReauthenticationRequiredError;
}
