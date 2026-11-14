import { apiRequest } from './client';
import type { AuthTokenRequestDto, AuthTokenResponseDto, UserDto, UserUpdateDto } from './types';

/** All REST paths used by the app, in one place. */
export const API_PATHS = {
  authToken: '/api/auth-token/',
  currentUser: '/api/users/me/',
  user: (id: number) => `/api/users/${id}/`,
} as const;

export function obtainAuthToken(payload: AuthTokenRequestDto): Promise<AuthTokenResponseDto> {
  return apiRequest<AuthTokenResponseDto>(API_PATHS.authToken, {
    method: 'POST',
    body: payload,
    authenticated: false,
  });
}

export function fetchCurrentUser(signal?: AbortSignal): Promise<UserDto> {
  return apiRequest<UserDto>(API_PATHS.currentUser, signal ? { signal } : {});
}

export function updateUser(id: number, payload: UserUpdateDto): Promise<UserDto> {
  return apiRequest<UserDto>(API_PATHS.user(id), { method: 'PATCH', body: payload });
}
