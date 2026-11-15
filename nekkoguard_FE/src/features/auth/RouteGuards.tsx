import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { ROUTES } from '@/app/routes';
import type { FlowId } from '@/api/types';
import { readNextUrl } from '@/lib/nextUrl';
import { AuthBootScreen } from './components/AuthBootScreen';
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

/** Full-page navigation to a non-React page (e.g. the Django admin). */
function ExternalRedirect({ url }: { url: string }) {
  useEffect(() => {
    window.location.replace(url);
  }, [url]);
  return <AuthBootScreen error={null} retrying={false} onRetry={() => window.location.replace(url)} />;
}

export function RequireAuth() {
  const { isAuthenticated, lastSignOutReason } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Return to the requested page after sign-in — but not after a deliberate sign-out
    // (or declining the Terms), where the next sign-in should start at the overview.
    const deliberate = lastSignOutReason === 'user' || lastSignOutReason === 'terms_declined';
    const state: LoginLocationState = deliberate ? {} : { from: `${location.pathname}${location.search}` };
    return <Navigate to={ROUTES.login} replace state={state} />;
  }
  return <Outlet />;
}

/**
 * Wraps sign-in / sign-up pages; once signed in, sends the user to where they were going:
 * a `?next=` page outside the app (Django admin), or the in-app page they requested.
 */
export function RedirectIfAuthenticated() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (isAuthenticated) {
    const next = readNextUrl(location.search);
    if (next) return <ExternalRedirect url={next} />;
    return <Navigate to={safeRedirect(location.state)} replace />;
  }
  return <Outlet />;
}

/** A step page (2FA code, "check your email") only makes sense while that step is pending. */
export function RequirePendingFlow({ flow }: { flow: FlowId }) {
  const { pendingFlow } = useAuth();
  const location = useLocation();
  if (pendingFlow !== flow) {
    // Keep ?next= so the user still lands on the admin after finishing sign-in.
    return <Navigate to={{ pathname: ROUTES.login, search: location.search }} replace state={location.state} />;
  }
  return <Outlet />;
}
