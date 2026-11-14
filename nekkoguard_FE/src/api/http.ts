import { config } from '@/config/env';
import { getCsrfToken, isUnsafeMethod } from './csrf';
import { ApiError } from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HttpRequest {
  method?: HttpMethod;
  body?: unknown;
  signal?: AbortSignal;
  /** Extra request headers (e.g. allauth's X-Email-Verification-Key). */
  headers?: Record<string, string>;
}

export interface HttpResult {
  status: number;
  /** Parsed JSON body, or null when empty / not JSON. */
  data: unknown;
}

/**
 * Low-level transport shared by the DRF and allauth clients.
 *
 * - Same-origin session cookie (`credentials: 'same-origin'`); the session cookie is
 *   HttpOnly and never touched by JavaScript.
 * - CSRF token header on unsafe methods.
 * - Timeouts and network failures become `ApiError`s; HTTP status handling is left to callers.
 */
export async function httpRequest(
  path: string,
  { method = 'GET', body, signal, headers: extraHeaders }: HttpRequest = {},
): Promise<HttpResult> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': 'en',
    ...extraHeaders,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (isUnsafeMethod(method)) {
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRFToken'] = csrf;
  }

  const timeout = AbortSignal.timeout(config.requestTimeoutMs);
  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? null : JSON.stringify(body),
      credentials: 'same-origin',
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError({ kind: 'timeout', message: 'The NekkoGuard server did not respond in time.' });
    }
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError({ kind: 'network', message: 'Cannot reach the NekkoGuard server.' });
  }

  let data: unknown = null;
  const text = response.status === 204 ? '' : await response.text();
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = null; // e.g. an HTML error page from a proxy
    }
  }
  return { status: response.status, data };
}
