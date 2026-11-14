import { Navigate, Outlet, useLocation } from 'react-router';
import { ROUTES } from '@/app/routes';
import type { FlowId } from '@/api/types';
import { useAuth } from './useAuth';

/** Location state passed to /login so the user returns to the page they asked for. */
export interface LoginLocationState {
  from?: string;
}

/** Only in-app paths are accepted as redirect targets (no open redirects). */
function safeRedirect(state: unknown): string {
  const from = (state as LoginLocationState | null)?.from;
  if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !from.startsWith(ROUTES.login)) {
    return from;
  }
  return ROUTES.overview;
}

export function RequireAuth() {
  const { isAuthenticated, lastSignOutReason } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Return to the requested page after sign-in — but not after a deliberate sign-out,
    // where the next person to sign in should start at the overview.
    const state: LoginLocationState =
      lastSignOutReason === 'user' ? {} : { from: `${location.pathname}${location.search}` };
    return <Navigate to={ROUTES.login} replace state={state} />;
  }
  return <Outlet />;
}

/** Wraps sign-in / sign-up pages; once signed in, sends the user to where they were going. */
export function RedirectIfAuthenticated() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (isAuthenticated) return <Navigate to={safeRedirect(location.state)} replace />;
  return <Outlet />;
}

/** A step page (2FA code, "check your email") only makes sense while that step is pending. */
export function RequirePendingFlow({ flow }: { flow: FlowId }) {
  const { pendingFlow } = useAuth();
  const location = useLocation();
  if (pendingFlow !== flow) return <Navigate to={ROUTES.login} replace state={location.state} />;
  return <Outlet />;
}
