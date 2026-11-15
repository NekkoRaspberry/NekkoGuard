import { apiRequest } from './client';
import type { UserSummaryDto } from './tenancy';

/**
 * Superuser "view as user" (backend: nekkoguard/users/impersonation.py).
 * While active, every /api/ request is answered as `user` and is read-only.
 */
export interface ImpersonationStatusDto {
  /** Only true for superusers: everyone else never sees the switcher. */
  available: boolean;
  active: boolean;
  /** The user the app is shown as (null when not active). */
  user: UserSummaryDto | null;
  /** The signed-in superuser. */
  real_user?: UserSummaryDto;
}

type Signal = AbortSignal | undefined;
const PATH = '/api/impersonation/';

export const impersonationApi = {
  status: (signal?: Signal) => apiRequest<ImpersonationStatusDto>(PATH, signal ? { signal } : {}),
  users: (search: string, signal?: Signal) =>
    apiRequest<UserSummaryDto[]>(`${PATH}users/?search=${encodeURIComponent(search)}`, signal ? { signal } : {}),
  start: (userId: number) => apiRequest<{ active: true }>(PATH, { method: 'POST', body: { user: userId } }),
  stop: () => apiRequest<{ active: false }>(PATH, { method: 'DELETE' }),
};
