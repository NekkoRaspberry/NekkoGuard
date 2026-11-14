import { config } from '@/config/env';
import { tokenStorage } from '@/features/auth/tokenStorage';
import { ApiError, defaultMessageForStatus, parseDrfErrorBody } from './errors';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  /** Send the stored API token (default true). */
  authenticated?: boolean;
  signal?: AbortSignal;
}

/**
 * DRF messages that mean "your credentials are missing or no longer valid".
 * The backend's default auth chain (Session → Token) answers these with 403, not 401,
 * so the status alone is not enough to tell an expired token from a permission error.
 */
const AUTH_FAILURE_MESSAGES = new Set([
  'Authentication credentials were not provided.',
  'Invalid token.',
  'User inactive or deleted.',
]);

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Registered by the AuthProvider so an invalid token anywhere signs the user out. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

function buildUrl(path: string): string {
  return `${config.apiBaseUrl}${path}`;
}

function combineSignals(timeoutMs: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return external ? AbortSignal.any([timeout, external]) : timeout;
}

async function readJson(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // e.g. an HTML error page from a proxy
    return null;
  }
}

/**
 * Single entry point for every REST call.
 *
 * - Token authentication only (`credentials: 'omit'`): browser cookies are never sent, so a
 *   Django session cookie cannot switch DRF into SessionAuthentication + CSRF mode.
 * - `Accept-Language: en` keeps server messages in the same language as the UI.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, authenticated = true, signal } = options;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': 'en',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = authenticated ? tokenStorage.getToken() : null;
  if (token) headers.Authorization = `Token ${token}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      method,
      headers,
      body: body === undefined ? null : JSON.stringify(body),
      credentials: 'omit',
      signal: combineSignals(config.requestTimeoutMs, signal),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError({ kind: 'timeout', message: 'The NekkoGuard server did not respond in time.' });
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiError({ kind: 'network', message: 'Cannot reach the NekkoGuard server.' });
  }

  const data = await readJson(response);

  if (!response.ok) {
    const { message, fieldErrors } = parseDrfErrorBody(data);

    const isAuthFailure =
      response.status === 401 || (response.status === 403 && message !== null && AUTH_FAILURE_MESSAGES.has(message));
    if (isAuthFailure && authenticated && token) {
      unauthorizedHandler?.();
    }

    throw new ApiError({
      kind: 'http',
      status: response.status,
      message: message ?? defaultMessageForStatus(response.status),
      fieldErrors,
    });
  }

  return data as T;
}
