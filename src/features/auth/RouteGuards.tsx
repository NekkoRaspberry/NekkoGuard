import { Navigate, Outlet, useLocation } from 'react-router';
import { ROUTES } from '@/app/routes';
import { useAuth } from './useAuth';

/** Location state passed to /login so the user returns to the page they asked for. */
export interface LoginLocationState {
  from?: string;
}

/** Only in-app paths are accepted as redirect targets (no open redirects). */
function safeRedirect(state: unknown): string {
  const from = (state as LoginLocationState | null)?.from;
  if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && from !== ROUTES.login) {
    return from;
  }
  return ROUTES.overview;
}

export function RequireAuth() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    const state: LoginLocationState = { from: `${location.pathname}${location.search}` };
    return <Navigate to={ROUTES.login} replace state={state} />;
  }
  return <Outlet />;
}

/** Wraps public auth pages; once signed in, sends the user to where they were going. */
export function RedirectIfAuthenticated() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (isAuthenticated) return <Navigate to={safeRedirect(location.state)} replace />;
  return <Outlet />;
}
