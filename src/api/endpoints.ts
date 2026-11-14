import { apiRequest } from './client';
import type { UserDto, UserUpdateDto } from './types';

/** DRF REST paths. Authentication lives in `allauth.ts`. */
export const API_PATHS = {
  currentUser: '/api/users/me/',
  user: (id: number) => `/api/users/${id}/`,
  /** Swagger UI — staff only (IsAdminUser). */
  docs: '/api/docs/',
} as const;

export function fetchCurrentUser(signal?: AbortSignal): Promise<UserDto> {
  return apiRequest<UserDto>(API_PATHS.currentUser, signal ? { signal } : {});
}

export function updateUser(id: number, payload: UserUpdateDto): Promise<UserDto> {
  return apiRequest<UserDto>(API_PATHS.user(id), { method: 'PATCH', body: payload });
}
